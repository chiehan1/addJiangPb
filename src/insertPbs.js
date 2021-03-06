import fs from 'fs';

const bampoCompareInfo = JSON.parse(fs.readFileSync('./assets/bampoCompareInfo.json', 'utf8'));

const flexibleRegex = JSON.parse(fs.readFileSync('./assets/flexibleSyllableRegex.json', 'utf8'));

let getFileName = (folder) => {
  return fs.readdirSync(folder)
    .filter(fileName => ('.' !== fileName[0]))[0];
};

let replaceWrongTLFFs = (text) => {
  return text.replace(/([\s་])\u0f6aང([\s་])/g, '$1\u0f62ང$2'); // TLFF is Tibetan-Letter-Fixed-Form 
  // 1. \u0f6aང may be correct in Sanskrit-transliterated Tibetan,
  //    but [\s་]\u0f6aང[\s་] is wrong even in Sanskrit-transliterated Tibetan, 
  //    commented by Karma Lobsang Gurung 
  // 2. what's fixed-form-tibetan-letters, see http://unicode.org/charts/PDF/U0F00.pdf
};

let getText = (folder) => {
  let fileName = getFileName(folder);
  let originalText = fs.readFileSync(folder + '/' + fileName, 'utf8');

  return replaceWrongTLFFs(originalText);
};

let removeNonPbTags = (text) => {
  return text.replace(/<(?!pb).*?>/g, '');
};

let split2Pages = (text, tagFirstLetter) => {
  let pages = removeNonPbTags(text).replace(/<(?!pb).*?>/g, '')
                                   .replace(/</g, '~$%<')
                                   .split('~$%')
                                   .filter(page => (page.match('<')));

  let pageObjs = pages.map(page => {
    let obj = {};
    obj.pbTag = '<' + tagFirstLetter + 'p=' + page.match(/".+?"/)[0] + '/>';
    obj.pageP = page.replace(/<.*?>(\r?\n)*/, '');

    return obj;
  });

  return pageObjs;
};

let split2Syls = (text) => {
  let syls = unifySylSeparator(text).split('་');
  return syls.map((syl) => {
    if (flexibleRegex[syl]) {
      return flexibleRegex[syl];
    }
    else {
      return syl;
    }
  });
};

let unifySylSeparator = (text) => {
  return text.replace(/(\r?\n)+/g, '་')
    .replace(/[༆༈།༎༏༐༑༒་ ]+/g, '་');
};

let getCountableTagValue = (tag) => {
  let matchResults = tag.match(/".+?\.(\d+?)([abcd])"/);
  let number = Number(matchResults[1]);
  let letter = matchResults[2];
  if ('a' === letter) {
    return number + 0.1;
  }
  else if ('b' === letter) {
    return number + 0.2;
  }
  else if ('c' === letter) {
    return number + 0.3;
  }
  else {
    return number + 0.4;
  }
};

let checkTagOrders = (text, tagRegex) => {
  let tags = text.match(tagRegex);
  let countableTagValues = tags.map(getCountableTagValue);
  let lastCountableTagValue = countableTagValues[0];
  let uncertainTags = [];

  for (var i = 1; i < countableTagValues.length; i++) {
    let countableTagValue = countableTagValues[i];
    if ((countableTagValue - lastCountableTagValue) > 1 || countableTagValue < lastCountableTagValue) {
      uncertainTags.push(tags[i]);
    }
    lastCountableTagValue = countableTagValue;
  }

  fs.writeFileSync('./uncertainTags.txt', uncertainTags.join('\r\n'), 'utf8');
};

let insertPbTag = (targetText, targetRegex, pbTag) => {
  let insertIndex = targetText.search(targetRegex);
  console.log('insert ', pbTag);

  return targetText.slice(0, insertIndex) + pbTag + targetText.slice(insertIndex);
};

let matchPages = (refFolder, targetFolder) => {
  let refTagFirstLetter = 'program' + getFileName(refFolder)[0];
  let refTagRegex = new RegExp('<' + refTagFirstLetter + 'p="(.+?)"/>', 'g');
  let refPageObjs = split2Pages(getText(refFolder), refTagFirstLetter);
  let targetText = getText(targetFolder);

  refPageObjs.forEach((obj) => {
    let pbTag = obj.pbTag;
    let syls = split2Syls(unifySylSeparator(obj.pageP));
    let sylSeparator = '(\r?\n|<.+?>|[༆༈།༎༏༐༑༒་ ])+?';
    let possibleSyl = '[^>༆༈།༎༏༐༑༒་ ]+';
    let matchRegex = syls[0] + sylSeparator;
    let lastMatchRegex = '';
    let totalSylsN = syls.length;

    for (let i = 1; i < totalSylsN; i++) {
      let nextMatchSyl = syls[i];
      let regex = new RegExp(matchRegex, 'g');
      let matchResult = targetText.match(regex);

      if (! matchResult) {

        if ('' !== lastMatchRegex) {
          lastMatchRegex += (possibleSyl + sylSeparator);
          matchRegex = lastMatchRegex + nextMatchSyl + sylSeparator;
        }
        else if (null === matchResult) {
          matchRegex = nextMatchSyl + sylSeparator;
        }
      }
      else if (matchResult.length > 1) {

        if ((totalSylsN - 3) === i) {
          targetText = insertPbTag(targetText, regex, pbTag);
          break;
        }

        lastMatchRegex = matchRegex;
        matchRegex += nextMatchSyl + sylSeparator;
      }
      else if (1 === matchResult.length) {
        targetText = insertPbTag(targetText, regex, pbTag);
        break;
      }
    }
  });

  checkTagOrders(targetText, refTagRegex);

  return targetText;
};

let insertedPbText = matchPages('./takePbTagsHere', './insertPbTagsHere');

fs.writeFileSync('./output.txt', insertedPbText, 'utf8');