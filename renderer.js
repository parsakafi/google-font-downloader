const rp = require('request-promise');
const fs = require('fs');
const path = require('path');
const $ = require('jquery');
const createHTML = require('create-html');
const electron = require('electron');
const app = electron.app || electron.remote.app;
const getUrls = require('get-urls');

const baseURL = 'https://fonts.googleapis.com/css2?family=';
const familyBaseURL = 'https://fonts.google.com/download?family=';
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:74.0) Gecko/20100101 Firefox/74.0';

String.prototype.replaceAll = function (find, replace) {
    let replaceString = this;
    return replaceString.split(find).join(replace);
};

String.prototype.ucwords = function () {
    let splitStr = this.split(' ');
    for (let i = 0; i < splitStr.length; i++) {
        splitStr[i] = splitStr[i].charAt(0).toUpperCase() + splitStr[i].substring(1);
    }
    return splitStr.join(' ');
};

$('.select-font-weight').on('click', (e) => {
    let command = $(e.target).attr('data-command');
    $('#font-weight input[type="checkbox"]').prop("checked", command === 'all');
});

$('#open-dir').on('click', () => {
    electron.shell.openItem($('#open-dir').attr('data-dir'));
});

$('#font-name').on('keyup', (e) => {
    if (e.keyCode === 13)
        $('#start-download').trigger('click');
});

$('#start-download').on('click', async () => {
    let fontName = $('#font-name').val().trim(), webFontName, familyFontName;
    if (fontName.length === 0) return;
    let weight = [], weightItalic = [], weightType = 'wght', weightStr, weighQuery = '', italic = false;

    if (!$('#type-woff').prop("checked") && !$('#type-ttf').prop("checked"))
        return;

    $.each($("#font-weight input[type='checkbox']:checked"), function () {
        let value = $(this).val();
        if (value.indexOf('i') !== -1) {
            value = '1,' + value.replace('i', '');
            weightItalic.push(value);
            italic = true;
        } else {
            value = '0,' + value;
            weight.push(value);
        }
    });

    if (italic)
        weightType = 'ital,' + weightType;

    weight = weight.concat(weightItalic);

    if (weight.length === 0) {
        $('#font-weight-title').css('color', '#ff1744');
        return;
    }
    $('#font-weight-title').css('color', '');

    weightStr = weight.join(';');
    if (!italic)
        weightStr = weightStr.replaceAll('0,', '').replaceAll('1,', '');
    if (weightStr !== '400')
        weighQuery = ':' + weightType + '@' + weightStr;

    fontName = fontName.ucwords();
    webFontName = fontName.replaceAll(' ', '+');
    familyFontName = fontName.replaceAll(' ', '%20');

    let url = baseURL + webFontName + weighQuery + '&display=swap';
    let familyUrl = familyBaseURL + familyFontName;

    $('#font-name').prop("readonly", true);
    $('input[type="checkbox"]').prop("disabled", true);
    $('#start-download').prop("disabled", true);
    $('.progress').show();
    $('#message').text('Downloading...').css('visibility', 'visible');
    $('#open-dir').css('visibility', 'hidden');

    let webFontExists = await urlExist(url);
    let familyFontExists = await urlExist(familyUrl);
    let downloadDir = await getDownloadDir(fontName, true);

    if (webFontExists && $('#type-woff').prop("checked")) {
        let file = downloadDir + path.sep + webFontName.replaceAll('+', '-') + '.css';
        await downloadFile(url, file);
        await sleep(5000);
        await downloadWoff(fontName, file);
    }

    if (familyFontExists && $('#type-ttf').prop("checked")) {
        let familyFile = downloadDir + path.sep + fontName + '.zip';
        await downloadFile(familyUrl, familyFile);
    }
    if (webFontExists || familyFontExists) {
        $('#message').html('Download Complete').css('visibility', 'visible');
        $('#open-dir').attr('data-dir', downloadDir).css('visibility', 'visible');
    } else {
        $('#message').text('Font not exists!').css('visibility', 'visible');
    }

    $('.progress').hide();
    $('#start-download').prop("disabled", false);
    $('input[type="checkbox"]').prop("disabled", false);
    $('#font-name').prop("readonly", false);
});

const urlExist = async url => {
    try {
        await rp({
            method: 'HEAD',
            uri: url,
            timeout: 20000,
            headers: {
                'User-Agent': userAgent
            }
        });
        return true;
    } catch (e) {
        return false;
    }
};

const getDownloadDir = async (subDir, firstDelete) => {
    subDir = subDir || null;
    firstDelete = firstDelete || false;
    let appPath = app.getAppPath().replace(path.sep + 'resources' + path.sep + 'app.asar', '');
    let dir = appPath + path.sep + 'Downloads';
    if (subDir)
        dir += path.sep + subDir;

    if (firstDelete && fs.existsSync(dir))
        fs.rmdirSync(dir, {recursive: true});
    await sleep(500);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {recursive: true});
    }
    return dir;
};

const downloadFile = async (file_url, targetPath) => {
    let ext = path.parse(targetPath).ext,
        contentType;

    if (ext === '.zip')
        contentType = 'applcation/zip';
    else if (ext === '.css')
        contentType = 'applcation/x-pointplus';
    else if (ext === '.woff2')
        contentType = 'font/woff2';

    const optionsStart = {
        uri: file_url,
        method: 'GET',
        headers: {
            'User-Agent': userAgent,
            'Content-type': contentType
        },
        timeout: 5 * 60 * 1000,
        encoding: null
    };

    await rp(optionsStart, (err, resp) => {
        let writeStream = fs.createWriteStream(targetPath);
        writeStream.write(resp.body, 'binary');
        writeStream.on('finish', () => {
            //console.log('wrote all data to file' + new Date().toString());
        });
        writeStream.end();
    });
};

const downloadWoff = async (fontName, cssFile) => {
    let fontsDir = fontName + path.sep + 'fonts';

    if (fs.existsSync(cssFile)) {
        let downloadDir = await getDownloadDir(fontsDir);
        let data = fs.readFileSync(cssFile, 'utf8'),
            lines = data.split('\n'),
            fontStyle = '', fontWeight = '', fontWeights = [];

        for (let i = 0; i <= lines.length - 1; i++) {
            let line = lines[i].trim(), script;
            if (line !== '') {
                if (line.indexOf('/*') !== -1) { //script
                    script = line.replace('/* ', '').replace(' */', '');
                }

                if (line.indexOf(':') !== -1) {
                    [key, value] = line.split(':');

                    if (key.trim() === 'font-style')
                        fontStyle = value.replace(';', '').trim();

                    else if (key.trim() === 'font-weight')
                        fontWeight = value.replace(';', '').trim();

                    else if (key.trim() === 'src') {
                        let matches = getUrls(line);
                        matches = Array.from(matches);
                        if (matches.length > 0) {
                            let fontURL = matches[0].replace(')', ''),
                                dlFontName = path.parse(fontURL).name + path.parse(fontURL).ext,
                                newFontName = fontName.replaceAll(' ', '-') + '-' + fontStyle + '-' + fontWeight + '-' + dlFontName,
                                fontDir = 'fonts/' + newFontName,
                                fontFile = downloadDir + path.sep + newFontName;

                            data = data.replace(fontURL, fontDir);
                            await downloadFile(fontURL, fontFile);
                            if (!fontWeights.includes(fontWeight + '-' + fontStyle))
                                fontWeights.push(fontWeight + '-' + fontStyle);
                        }
                    }
                }
            }
        }

        await fs.writeFileSync(cssFile, data);
        await createDemo(fontName, cssFile, fontWeights);
    }
};

const createDemo = async (fontName, cssFile, fontWeights) => {
    let demoFile = await getDownloadDir(fontName) + path.sep + 'demo.html',
        cssFileName = path.parse(cssFile).name + path.parse(cssFile).ext;
    fontWeights.sort();
    let body = `<h1>${fontName}</h1>\n`,
        style = `\n
    body {
        font-family: "${fontName}", sans-serif;
        color: #333;
        font-size: 20px;
        background-color: #f4f6f6;
        padding: 2rem 3rem
    }
    h1 {
        margin-top: 0;
    }
    a {
        color: #1a73e8;
        text-decoration: none;
    }
    p {
        margin: 10px 0 0;
    }
    .font-weight {
        margin-bottom: 2rem;
        padding: 20px;
        box-shadow: 0 3px 12px 0 #ebebeb;
        transition: all 0.25s;
        border-radius: 9px;
        background-color: white;
    }
    .font-weight:hover {
        transform: translateY(-5px);
        box-shadow: 0 2px 30px 0 #ced3d6;
    }
    .font-weight span {
        color: #999;
        font-size: .7em;
    }
    .copyright{
        margin-top: 5rem;
    }\n`,
        str = 'Almost before we knew it, we had left the ground.',
        head = '<meta name="viewport" content="width=device-width, user-scalable=no, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0">';

    fontWeights.forEach(function (item) {
        [weightNumber, weightName] = item.split('-');
        style += `    .${weightName}-${weightNumber} {font-weight: ${weightNumber}; font-style: ${weightName};}\n`;
        //body += `<p class="${item} font-weight">${str}</p>\n`;
        body += `<div class="${weightName}-${weightNumber} font-weight">
    <span>${weightName.ucwords()} ${weightNumber}</span>
    <p>${str}</p>
</div>\n`;
    });

    style = `<style>${style}</style>\n`;
    body += '<div class="copyright">© <a href="https://github.com/parsakafi/google-font-downloader">Google Font Downloader</a>, <a href="https://parsa.ws">Parsa.ws</a></div>';

    let html = createHTML({
        title: fontName,
        css: cssFileName,
        lang: 'en',
        dir: 'ltr',
        head: `${head}\n${style}`,
        body: body
    });

    await fs.writeFileSync(demoFile, html);
};

const sleep = ms => {
    return new Promise(resolve => setTimeout(resolve, ms));
};