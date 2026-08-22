import { dict } from './dic.js'
import { dictTraditional } from './dicTraditional.js'

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

SimpleInputMethod.initDict = function() {
    this.dict.py2hz = dict;
    this.dict.py2hz2 = buildInitialIndex(dict);
    this.traditionalDict.py2hz = dictTraditional;
    this.traditionalDict.py2hz2 = buildInitialIndex(dictTraditional);
};

SimpleInputMethod.getSingleHanzi = function(pinyin, traditional) {
    const activeDict = traditional ? this.traditionalDict : this.dict;
    return activeDict.py2hz2[pinyin] || activeDict.py2hz[pinyin] || '';
}

SimpleInputMethod.getHanzi = function(pinyin, traditional = false) {
    let result = this.getSingleHanzi(pinyin, traditional);
    if (result) return [result.split(''), pinyin];

    let start = Math.min(pinyin.length, 6);
    for (let i = start; i >= 1; i--) {
        let str = pinyin.substr(0, i);
        let rs = this.getSingleHanzi(str, traditional);
        if (rs) return [rs.split(''), str];
    }

    return [[], '']; // 理论上一般不会出现这种情况
};

// 方屏中文 T9 使用完整的数字序列匹配拼音，而不是同一按键多击选字母。
// 例如 2-3-4 会匹配 bei，并返回“被、北、倍”等候选。扫描词典键名即可，
// 不额外复制大型汉字词典，避免手表端常驻内存增加。
SimpleInputMethod.getT9Hanzi = function(digits, traditional = false) {
    if (!digits) {
        return [[], []];
    }
    const activeDict = traditional ? this.traditionalDict.py2hz : this.dict.py2hz;
    const words = [];
    const matchedPinyin = [];
    for (let pinyin in activeDict) {
        if (pinyinToT9(pinyin) === digits) {
            matchedPinyin.push(pinyin);
            const hanzi = activeDict[pinyin];
            for (let i = 0; i < hanzi.length; i++) {
                words.push(hanzi[i]);
            }
        }
    }
    return [words, matchedPinyin];
};

SimpleInputMethod.initDict();

export { SimpleInputMethod } // 换成 export default SimpleInputMethod; 不能用
