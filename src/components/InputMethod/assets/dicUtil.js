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

SimpleInputMethod.initDict();

export { SimpleInputMethod } // 换成 export default SimpleInputMethod; 不能用
