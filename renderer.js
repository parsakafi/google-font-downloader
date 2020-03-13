const rp = require('request-promise');
const fs = require('fs');
const path = require('path');
const $ = require('jquery');
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
        $('#message').html('Download Completed').css('visibility', 'visible');
        $('#open-dir').attr('data-dir', downloadDir).css('visibility', 'visible');
    } else {
        $('#message').text('Font not exists!').css('visibility', 'visible');
    }

    $('.progress').hide();
    $('#start-download').prop("disabled", false);
    $('#font-name').prop("readonly", false);
});

async function urlExist(url) {
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
}

async function getDownloadDir(subDir, firstDelete) {
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
}

async function downloadFile(file_url, targetPath) {
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
}

const downloadWoff = async (fontName, cssFile) => {
    let fontsDir = fontName + path.sep + 'fonts';

    if (fs.existsSync(cssFile)) {
        let downloadDir = await getDownloadDir(fontsDir);
        let data = fs.readFileSync(cssFile, 'utf8'),
            lines = data.split('\n'),
            fontStyle = '', fontWeight = '';

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
                        }
                    }
                }
            }
        }
        await fs.writeFileSync(cssFile, data);
    }
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}