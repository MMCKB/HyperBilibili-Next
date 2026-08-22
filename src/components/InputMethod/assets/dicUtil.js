import { dict } from './dic.js'
import { dictTraditional } from './dicTraditional.js'
import { phraseEntries } from './dicPhrase.js'

let SimpleInputMethod = {
    dict: {},
    traditionalDict: {}
}

function buildInitialIndex(source) {
    const index = {};
    index['i'] = 'i'; // i 比较特殊，没有符合的汉字，所以特殊处理
    for (let key in source) {
        const initial = key[0];
        if (!index[initial]) {
            index[initial] = source[key];
        }
    }
    return index;
}

// 标准手机九键字母映射。词典使用纯拼音键，因此可直接把拼音编码为数字序列。
const T9_KEY_MAP = {
    a: '2', b: '2', c: '2',
    d: '3', e: '3', f: '3',
    g: '4', h: '4', i: '4',
    j: '5', k: '5', l: '5',
    m: '6', n: '6', o: '6',
    p: '7', q: '7', r: '7', s: '7',
    t: '8', u: '8', v: '8',
    w: '9', x: '9', y: '9', z: '9'
};

function pinyinToT9(pinyin) {
    let result = '';
    for (let i = 0; i < pinyin.length; i++) {
        const digit = T9_KEY_MAP[pinyin[i]];
        if (!digit) {
            return '';
        }
        result += digit;
    }
    return result;
}

function normalizePinyin(pinyin) {
    return (pinyin || '').toLowerCase().replace(/'/g, '');
}

// 高频多音节词组索引。列 1 为简体、列 2 为繁体；数组顺序保持候选优先级。
function buildPhraseIndex(column) {
    const index = {};
    for (let i = 0; i < phraseEntries.length; i++) {
        const entry = phraseEntries[i];
        const pinyin = entry[0];
        const word = entry[column];
        if (!index[pinyin]) {
            index[pinyin] = [];
        }
        if (index[pinyin].indexOf(word) < 0) {
            index[pinyin].push(word);
        }
    }
    return index;
}

function buildT9PhraseIndex(phraseIndex) {
    const index = {};
    const pinyinIndex = {};
    for (let pinyin in phraseIndex) {
        const digits = pinyinToT9(pinyin);
        if (!digits) {
            continue;
        }
        if (!index[digits]) {
            index[digits] = [];
            pinyinIndex[digits] = [];
        }
        pinyinIndex[digits].push(pinyin);
        const words = phraseIndex[pinyin];
        for (let i = 0; i < words.length; i++) {
            if (index[digits].indexOf(words[i]) < 0) {
                index[digits].push(words[i]);
            }
        }
    }
    return {
        words: index,
        pinyin: pinyinIndex
    };
}

function createEntries(words, remainderPinyin, remainderDigits) {
    const entries = [];
    for (let i = 0; i < words.length; i++) {
        entries.push({
            text: words[i],
            remainderPinyin: remainderPinyin || '',
            remainderDigits: remainderDigits || ''
        });
    }
    return entries;
}

function mergeEntries() {
    const result = [];
    const max = 48;
    for (let i = 0; i < arguments.length; i++) {
        const entries = arguments[i] || [];
        for (let j = 0; j < entries.length; j++) {
            const entry = entries[j];
            let duplicate = false;
            for (let k = 0; k < result.length; k++) {
                if (result[k].text === entry.text) {
                    duplicate = true;
                    break;
                }
            }
            if (!duplicate) {
                result.push(entry);
                if (result.length >= max) {
                    return result;
                }
            }
        }
    }
    return result;
}

function entriesToTexts(entries) {
    const texts = [];
    for (let i = 0; i < entries.length; i++) {
        texts.push(entries[i].text);
    }
    return texts;
}

// 根据当前的完整拼音贪婪拆分音节，例如 nihao → [ni, hao]。
function splitSyllables(pinyin, py2hz) {
    const memo = {};
    function splitFrom(start) {
        if (start >= pinyin.length) {
            return [];
        }
        if (memo[start]) {
            return memo[start];
        }
        const maxLength = Math.min(6, pinyin.length - start);
        for (let length = maxLength; length >= 1; length--) {
            const syllable = pinyin.substr(start, length);
            if (!py2hz[syllable]) {
                continue;
            }
            const rest = splitFrom(start + length);
            if (rest || start + length === pinyin.length) {
                const result = [syllable];
                if (rest) {
                    for (let i = 0; i < rest.length; i++) {
                        result.push(rest[i]);
                    }
                }
                memo[start] = result;
                return result;
            }
        }
        memo[start] = null;
        return null;
    }
    return splitFrom(0) || [];
}

// 词组候选之后追加每个音节的单字候选；选中前一音节时保留后续输入。
function buildSyllableEntries(pinyin, activeDict) {
    const syllables = splitSyllables(pinyin, activeDict.py2hz);
    if (syllables.length < 2) {
        return [];
    }
    const entries = [];
    for (let i = 0; i < syllables.length; i++) {
        const syllable = syllables[i];
        const remainingPinyin = syllables.slice(i + 1).join('');
        const remainingDigits = pinyinToT9(remainingPinyin);
        const hanzi = activeDict.py2hz[syllable] || '';
        for (let j = 0; j < hanzi.length && j < 16; j++) {
            entries.push({
                text: hanzi[j],
                remainderPinyin: remainingPinyin,
                remainderDigits: remainingDigits
            });
        }
    }
    return entries;
}

function buildSingleEntries(pinyin, activeDict) {
    const hanzi = activeDict.py2hz[pinyin] || '';
    return createEntries(hanzi.split(''));
}

SimpleInputMethod.initDict = function() {
    this.dict.py2hz = dict;
    this.dict.py2hz2 = buildInitialIndex(dict);
    this.dict.phrase = buildPhraseIndex(1);
    this.dict.t9Phrase = buildT9PhraseIndex(this.dict.phrase);

    this.traditionalDict.py2hz = dictTraditional;
    this.traditionalDict.py2hz2 = buildInitialIndex(dictTraditional);
    this.traditionalDict.phrase = buildPhraseIndex(2);
    this.traditionalDict.t9Phrase = buildT9PhraseIndex(this.traditionalDict.phrase);
};

SimpleInputMethod.getSingleHanzi = function(pinyin, traditional) {
    const activeDict = traditional ? this.traditionalDict : this.dict;
    return activeDict.py2hz2[pinyin] || activeDict.py2hz[pinyin] || '';
}

// 指定单个拼音时只返回该拼音的汉字，用于九键展开面板的拼音分组选择。
SimpleInputMethod.getPinyinCandidates = function(pinyin, traditional = false) {
    const normalizedPinyin = normalizePinyin(pinyin);
    const activeDict = traditional ? this.traditionalDict : this.dict;
    return createEntries((activeDict.py2hz[normalizedPinyin] || '').split(''));
};

// 全拼候选：完整词组排在前；展开时继续给出 ni、hao 等音节的单字候选。
SimpleInputMethod.getHanziCandidates = function(pinyin, traditional = false) {
    const normalizedPinyin = normalizePinyin(pinyin);
    const activeDict = traditional ? this.traditionalDict : this.dict;
    const phraseEntriesForPinyin = createEntries(activeDict.phrase[normalizedPinyin] || []);
    const syllableEntries = buildSyllableEntries(normalizedPinyin, activeDict);
    const exactSingleEntries = buildSingleEntries(normalizedPinyin, activeDict);
    const candidates = mergeEntries(phraseEntriesForPinyin, syllableEntries, exactSingleEntries);
    if (candidates.length) {
        return [candidates, normalizedPinyin];
    }

    // 保留原有未完成拼音的回退行为。
    let start = Math.min(normalizedPinyin.length, 6);
    for (let i = start; i >= 1; i--) {
        let str = normalizedPinyin.substr(0, i);
        let rs = this.getSingleHanzi(str, traditional);
        if (rs) return [createEntries(rs.split('')), str];
    }
    return [[], ''];
};

// 对外保留旧接口，供现有代码或外部调用继续取得纯文本候选数组。
SimpleInputMethod.getHanzi = function(pinyin, traditional = false) {
    const result = this.getHanziCandidates(pinyin, traditional);
    return [entriesToTexts(result[0]), result[1]];
};

// 方屏中文 T9：完整词组排在前，再追加逐音节的单字候选与原有单音节回退。
SimpleInputMethod.getT9Candidates = function(digits, traditional = false) {
    if (!digits) {
        return [[], []];
    }
    const activeDict = traditional ? this.traditionalDict : this.dict;
    const phraseWords = activeDict.t9Phrase.words[digits] || [];
    const phrasePinyin = activeDict.t9Phrase.pinyin[digits] || [];
    let syllableEntries = [];
    for (let i = 0; i < phrasePinyin.length; i++) {
        syllableEntries = syllableEntries.concat(buildSyllableEntries(phrasePinyin[i], activeDict));
    }

    const singleEntries = [];
    const matchedPinyin = [];
    for (let pinyin in activeDict.py2hz) {
        if (pinyinToT9(pinyin) === digits) {
            matchedPinyin.push(pinyin);
            const hanzi = activeDict.py2hz[pinyin];
            for (let i = 0; i < hanzi.length; i++) {
                singleEntries.push({ text: hanzi[i], remainderPinyin: '', remainderDigits: '' });
            }
        }
    }
    return [mergeEntries(createEntries(phraseWords), syllableEntries, singleEntries), matchedPinyin];
};

// 九键展开面板左侧使用的可选拼音列表。去重后保留词典原始优先顺序。
SimpleInputMethod.getT9PinyinList = function(digits, traditional = false) {
    const result = this.getT9Candidates(digits, traditional);
    const pinyinList = [];
    for (let i = 0; i < result[1].length; i++) {
        if (pinyinList.indexOf(result[1][i]) < 0) {
            pinyinList.push(result[1][i]);
        }
    }
    return pinyinList;
};

SimpleInputMethod.getT9Hanzi = function(digits, traditional = false) {
    const result = this.getT9Candidates(digits, traditional);
    return [entriesToTexts(result[0]), result[1]];
};

SimpleInputMethod.initDict();

export { SimpleInputMethod } // 换成 export default SimpleInputMethod; 不能用
