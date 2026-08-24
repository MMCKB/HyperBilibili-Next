import { dict } from './dic.js'
import { dictTraditional } from './dicTraditional.js'
import { getPhraseShard } from './dicPhraseShards.js'

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

// 常用普通话模糊音。每次仅生成一层变体，避免组合爆炸和手表端额外内存压力。
function getFuzzyPinyinVariants(pinyin) {
    const variants = [pinyin];
    function addVariant(value) {
        if (value && variants.indexOf(value) < 0 && variants.length < 12) {
            variants.push(value);
        }
    }
    function swapInitial(longInitial, shortInitial) {
        if (pinyin.substr(0, longInitial.length) === longInitial) {
            addVariant(shortInitial + pinyin.substr(longInitial.length));
        } else if (pinyin.substr(0, shortInitial.length) === shortInitial) {
            addVariant(longInitial + pinyin.substr(shortInitial.length));
        }
    }
    // 平翘舌与常见声母混淆。
    swapInitial('zh', 'z');
    swapInitial('ch', 'c');
    swapInitial('sh', 's');
    swapInitial('n', 'l');
    swapInitial('f', 'h');
    swapInitial('r', 'l');

    // 前后鼻音及常见韵母混淆；只作用于拼音末尾。
    const finals = [
        ['iang', 'ian'], ['uang', 'uan'], ['ang', 'an'],
        ['eng', 'en'], ['ing', 'in'], ['ong', 'on']
    ];
    for (let i = 0; i < finals.length; i++) {
        const longFinal = finals[i][0];
        const shortFinal = finals[i][1];
        if (pinyin.length > longFinal.length && pinyin.substr(pinyin.length - longFinal.length) === longFinal) {
            addVariant(pinyin.substr(0, pinyin.length - longFinal.length) + shortFinal);
        } else if (pinyin.length > shortFinal.length && pinyin.substr(pinyin.length - shortFinal.length) === shortFinal) {
            addVariant(pinyin.substr(0, pinyin.length - shortFinal.length) + longFinal);
        }
    }
    return variants;
}

const FUZZY_T9_CACHE_LIMIT = 24;

function createFuzzyT9Cache() {
    return { matches: {}, order: [] };
}

function mergePinyinLists() {
    const result = [];
    for (let i = 0; i < arguments.length; i++) {
        const list = arguments[i] || [];
        for (let j = 0; j < list.length; j++) {
            if (result.indexOf(list[j]) < 0) {
                result.push(list[j]);
            }
        }
    }
    return result;
}

function getFuzzyT9Pinyin(digits, activeDict) {
    const cache = activeDict.fuzzyT9Cache;
    if (cache.matches[digits]) {
        const cachedIndex = cache.order.indexOf(digits);
        if (cachedIndex >= 0) {
            cache.order.splice(cachedIndex, 1);
        }
        cache.order.push(digits);
        return cache.matches[digits];
    }
    const matches = [];
    for (let pinyin in activeDict.py2hz) {
        const variants = getFuzzyPinyinVariants(pinyin);
        for (let i = 0; i < variants.length; i++) {
            if (pinyinToT9(variants[i]) === digits) {
                matches.push(pinyin);
                break;
            }
        }
    }
    cache.matches[digits] = matches;
    cache.order.push(digits);
    while (cache.order.length > FUZZY_T9_CACHE_LIMIT) {
        const expired = cache.order.shift();
        delete cache.matches[expired];
    }
    return matches;
}

// 多拼词组按首字母保存在惰性函数中。只缓存最近查询的少数分片，
// 避免键盘唤起时同时创建全部简繁和九键索引。
const T9_INITIALS = {
    '2': ['a', 'b', 'c'],
    '3': ['d', 'e', 'f'],
    '4': ['g', 'h', 'i'],
    '5': ['j', 'k', 'l'],
    '6': ['m', 'n', 'o'],
    '7': ['p', 'q', 'r', 's'],
    '8': ['t', 'u', 'v'],
    '9': ['w', 'x', 'y', 'z']
};
const PHRASE_CACHE_LIMIT = 4;

function createPhraseCache() {
    return { shards: {}, order: [] };
}

function touchPhraseShard(cache, initial) {
    const position = cache.order.indexOf(initial);
    if (position >= 0) {
        cache.order.splice(position, 1);
    }
    cache.order.push(initial);
    while (cache.order.length > PHRASE_CACHE_LIMIT) {
        const expired = cache.order.shift();
        delete cache.shards[expired];
    }
}

function getCachedPhraseShard(activeDict, initial) {
    if (!initial) {
        return [];
    }
    const cache = activeDict.phraseCache;
    if (cache.shards[initial]) {
        touchPhraseShard(cache, initial);
        return cache.shards[initial];
    }
    const rawShard = getPhraseShard(initial);
    const shard = [];
    for (let i = 0; i < rawShard.length; i++) {
        const raw = rawShard[i];
        shard.push({
            pinyin: raw[0],
            simplified: raw[1],
            traditional: raw[2],
            digits: pinyinToT9(raw[0])
        });
    }
    cache.shards[initial] = shard;
    touchPhraseShard(cache, initial);
    return shard;
}

function getPhraseWords(pinyin, activeDict, traditional) {
    const shard = getCachedPhraseShard(activeDict, pinyin[0]);
    const words = [];
    for (let i = 0; i < shard.length; i++) {
        const entry = shard[i];
        if (entry.pinyin === pinyin) {
            const word = traditional ? entry.traditional : entry.simplified;
            if (words.indexOf(word) < 0) {
                words.push(word);
            }
        }
    }
    return words;
}

function getT9PhraseMatches(digits, activeDict, traditional) {
    const initials = T9_INITIALS[digits[0]] || [];
    const words = [];
    const pinyin = [];
    for (let i = 0; i < initials.length; i++) {
        const shard = getCachedPhraseShard(activeDict, initials[i]);
        for (let j = 0; j < shard.length; j++) {
            const entry = shard[j];
            if (entry.digits !== digits) {
                continue;
            }
            const word = traditional ? entry.traditional : entry.simplified;
            if (words.indexOf(word) < 0) {
                words.push(word);
            }
            if (pinyin.indexOf(entry.pinyin) < 0) {
                pinyin.push(entry.pinyin);
            }
        }
    }
    return { words: words, pinyin: pinyin };
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

function buildT9SyllableIndex(source) {
    const index = {};
    for (let pinyin in source) {
        const t9 = pinyinToT9(pinyin);
        if (!t9) {
            continue;
        }
        if (!index[t9]) {
            index[t9] = [];
        }
        index[t9].push(pinyin);
    }
    return index;
}

// 对任意九键数字串按可用拼音音节分段，例如 96524 → wo + lai。
// 优先匹配更长的音节，使“我”被选中后仍能保留 524（lai）继续输入。
function splitT9Syllables(digits, activeDict) {
    const t9ToPinyin = activeDict.t9Syllables;
    const memo = {};
    function splitFrom(start) {
        if (start >= digits.length) {
            return [];
        }
        if (memo[start] !== undefined) {
            return memo[start];
        }
        const maxLength = Math.min(6, digits.length - start);
        for (let length = maxLength; length >= 1; length--) {
            const part = digits.substr(start, length);
            const candidates = mergePinyinLists(t9ToPinyin[part] || [], getFuzzyT9Pinyin(part, activeDict));
            if (!candidates.length) {
                continue;
            }
            const rest = splitFrom(start + length);
            if (rest || start + length === digits.length) {
                const result = [{ digits: part, pinyin: candidates }];
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

// 将同一数字组的多个拼音候选交错排列。这样 524 同时对应 kai、lai 时，
// “开、来”会相邻出现，不会先堆满 kai 的候选才看到 lai。
function buildT9GroupEntries(pinyinList, activeDict, remainderDigits) {
    const entries = [];
    for (let rank = 0; rank < 12; rank++) {
        for (let i = 0; i < pinyinList.length; i++) {
            const hanzi = activeDict.py2hz[pinyinList[i]] || '';
            if (hanzi[rank]) {
                entries.push({
                    text: hanzi[rank],
                    remainderPinyin: '',
                    remainderDigits: remainderDigits || ''
                });
            }
        }
    }
    return entries;
}

// 每个音节都产生候选。选择前一音节时携带后续数字串，继续显示下一音节的汉字。
function buildT9SyllableEntries(digits, activeDict) {
    const syllables = splitT9Syllables(digits, activeDict);
    if (syllables.length < 2) {
        return [];
    }
    const entries = [];
    for (let i = 0; i < syllables.length; i++) {
        let remainderDigits = '';
        for (let j = i + 1; j < syllables.length; j++) {
            remainderDigits += syllables[j].digits;
        }
        const groupEntries = buildT9GroupEntries(syllables[i].pinyin, activeDict, remainderDigits);
        for (let j = 0; j < groupEntries.length; j++) {
            entries.push(groupEntries[j]);
        }
    }
    return entries;
}

SimpleInputMethod.initDict = function() {
    this.dict.py2hz = dict;
    this.dict.py2hz2 = buildInitialIndex(dict);
    this.dict.t9Syllables = buildT9SyllableIndex(dict);
    this.dict.fuzzyT9Cache = createFuzzyT9Cache();
    this.dict.phraseCache = createPhraseCache();

    this.traditionalDict.py2hz = dictTraditional;
    this.traditionalDict.py2hz2 = buildInitialIndex(dictTraditional);
    this.traditionalDict.t9Syllables = buildT9SyllableIndex(dictTraditional);
    this.traditionalDict.fuzzyT9Cache = createFuzzyT9Cache();
    this.traditionalDict.phraseCache = createPhraseCache();
};

SimpleInputMethod.getSingleHanzi = function(pinyin, traditional) {
    const activeDict = traditional ? this.traditionalDict : this.dict;
    return activeDict.py2hz2[pinyin] || activeDict.py2hz[pinyin] || '';
}

// 全拼候选：完整词组排在前；展开时继续给出 ni、hao 等音节的单字候选。
SimpleInputMethod.getHanziCandidates = function(pinyin, traditional = false) {
    const normalizedPinyin = normalizePinyin(pinyin);
    const activeDict = traditional ? this.traditionalDict : this.dict;
    const variants = getFuzzyPinyinVariants(normalizedPinyin);
    let phraseEntriesForPinyin = [];
    let syllableEntries = [];
    let exactSingleEntries = [];

    // 原拼音始终排在第一位；模糊音只作为追加候选，避免改变精确输入的首选顺序。
    for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        phraseEntriesForPinyin = phraseEntriesForPinyin.concat(createEntries(getPhraseWords(variant, activeDict, traditional)));
        syllableEntries = syllableEntries.concat(buildSyllableEntries(variant, activeDict));
        exactSingleEntries = exactSingleEntries.concat(buildSingleEntries(variant, activeDict));
    }
    const candidates = mergeEntries(phraseEntriesForPinyin, syllableEntries, exactSingleEntries);
    if (candidates.length) {
        return [candidates, normalizedPinyin];
    }

    // 保留原有未完成拼音的回退行为，并依次尝试其模糊音变体。
    let start = Math.min(normalizedPinyin.length, 6);
    for (let i = start; i >= 1; i--) {
        const str = normalizedPinyin.substr(0, i);
        const fallbackVariants = getFuzzyPinyinVariants(str);
        for (let j = 0; j < fallbackVariants.length; j++) {
            const rs = this.getSingleHanzi(fallbackVariants[j], traditional);
            if (rs) return [createEntries(rs.split('')), str];
        }
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
    const phraseMatches = getT9PhraseMatches(digits, activeDict, traditional);
    const phraseWords = phraseMatches.words;
    const phrasePinyin = phraseMatches.pinyin;
    let phraseSyllableEntries = [];
    for (let i = 0; i < phrasePinyin.length; i++) {
        phraseSyllableEntries = phraseSyllableEntries.concat(buildSyllableEntries(phrasePinyin[i], activeDict));
    }
    const genericSyllableEntries = buildT9SyllableEntries(digits, activeDict);

    const matchedPinyin = mergePinyinLists(activeDict.t9Syllables[digits] || [], getFuzzyT9Pinyin(digits, activeDict));
    const singleEntries = buildT9GroupEntries(matchedPinyin, activeDict, '');
    return [mergeEntries(createEntries(phraseWords), phraseSyllableEntries, genericSyllableEntries, singleEntries), matchedPinyin];
};

// 九键展开面板使用的拼音分组。每组保留各自汉字候选和后续数字，
// 使用户可先在左侧选择 hao、gao 等拼音，再在右侧选择对应汉字。
SimpleInputMethod.getT9PinyinGroups = function(digits, traditional = false) {
    if (!digits) {
        return [];
    }
    const activeDict = traditional ? this.traditionalDict : this.dict;
    const groups = [];
    const seen = {};
    function addGroup(pinyin, entries) {
        if (!pinyin || seen[pinyin] || !entries || !entries.length) {
            return;
        }
        seen[pinyin] = true;
        groups.push({ pinyin: pinyin, candidates: entries });
    }

    const phraseMatches = getT9PhraseMatches(digits, activeDict, traditional);
    for (let i = 0; i < phraseMatches.pinyin.length; i++) {
        const pinyin = phraseMatches.pinyin[i];
        addGroup(pinyin, createEntries(getPhraseWords(pinyin, activeDict, traditional)));
    }

    const exactPinyin = mergePinyinLists(activeDict.t9Syllables[digits] || [], getFuzzyT9Pinyin(digits, activeDict));
    for (let i = 0; i < exactPinyin.length; i++) {
        addGroup(exactPinyin[i], buildT9GroupEntries([exactPinyin[i]], activeDict, ''));
    }

    const syllables = splitT9Syllables(digits, activeDict);
    if (syllables.length >= 2) {
        let remainderDigits = '';
        for (let i = 1; i < syllables.length; i++) {
            remainderDigits += syllables[i].digits;
        }
        const firstSyllable = syllables[0];
        for (let i = 0; i < firstSyllable.pinyin.length; i++) {
            const pinyin = firstSyllable.pinyin[i];
            addGroup(pinyin, buildT9GroupEntries([pinyin], activeDict, remainderDigits));
        }
    }
    return groups;
};

SimpleInputMethod.getT9Hanzi = function(digits, traditional = false) {
    const result = this.getT9Candidates(digits, traditional);
    return [entriesToTexts(result[0]), result[1]];
};

SimpleInputMethod.initDict();

export { SimpleInputMethod } // 换成 export default SimpleInputMethod; 不能用
