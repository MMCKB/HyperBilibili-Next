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
    for (let pinyin in phraseIndex) {
        const digits = pinyinToT9(pinyin);
        if (!digits) {
            continue;
        }
        if (!index[digits]) {
            index[digits] = [];
        }
        const words = phraseIndex[pinyin];
        for (let i = 0; i < words.length; i++) {
            if (index[digits].indexOf(words[i]) < 0) {
                index[digits].push(words[i]);
            }
        }
    }
    return index;
}

function mergeCandidates(primary, secondary, limit) {
    const result = [];
    const max = limit || 40;
    const sources = [primary || [], secondary || []];
    for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        for (let j = 0; j < source.length; j++) {
            const candidate = source[j];
            if (result.indexOf(candidate) < 0) {
                result.push(candidate);
                if (result.length >= max) {
                    return result;
                }
            }
        }
    }
    return result;
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

// 全拼查询：先精确匹配高频多音节词组，再保留原有单音节回退行为。
SimpleInputMethod.getHanzi = function(pinyin, traditional = false) {
    const normalizedPinyin = normalizePinyin(pinyin);
    const activeDict = traditional ? this.traditionalDict : this.dict;
    const phraseCandidates = activeDict.phrase[normalizedPinyin];
    if (phraseCandidates && phraseCandidates.length) {
        return [phraseCandidates.slice(), normalizedPinyin];
    }

    let result = this.getSingleHanzi(normalizedPinyin, traditional);
    if (result) return [result.split(''), normalizedPinyin];

    let start = Math.min(normalizedPinyin.length, 6);
    for (let i = start; i >= 1; i--) {
        let str = normalizedPinyin.substr(0, i);
        let rs = this.getSingleHanzi(str, traditional);
        if (rs) return [rs.split(''), str];
    }

    return [[], '']; // 理论上一般不会出现这种情况
};

// 方屏中文 T9：同一数字串优先给出完整词组，其次保留单音节汉字候选。
SimpleInputMethod.getT9Hanzi = function(digits, traditional = false) {
    if (!digits) {
        return [[], []];
    }
    const activeDict = traditional ? this.traditionalDict : this.dict;
    const phraseCandidates = activeDict.t9Phrase[digits] || [];
    const words = [];
    const matchedPinyin = [];
    for (let pinyin in activeDict.py2hz) {
        if (pinyinToT9(pinyin) === digits) {
            matchedPinyin.push(pinyin);
            const hanzi = activeDict.py2hz[pinyin];
            for (let i = 0; i < hanzi.length; i++) {
                words.push(hanzi[i]);
            }
        }
    }
    return [mergeCandidates(phraseCandidates, words), matchedPinyin];
};

SimpleInputMethod.initDict();

export { SimpleInputMethod } // 换成 export default SimpleInputMethod; 不能用
