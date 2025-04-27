demo = {
  type: 'ARRAY',
  elementType: 'STRING',
  sqlType: 'SQLNCHAR',
  jsType: 'JS_STRING',
  cType: 'SQL_C_WCHAR',
  isBcp: true,
  encoding: options.encoding,
  precision: maxStrLength,
  scale: 0,
  paramSize: 'SQL_VARLEN_DATA',
  bufferLen: maxStrLength + 1,
  hasNulls: nullMap.some(isNull => isNull),
  nullMap,
  value: array,
  encodedValues
}

export class ParamProcessor {

}
