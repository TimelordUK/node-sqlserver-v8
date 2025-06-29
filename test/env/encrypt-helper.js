class EncryptHelper {
  constructor (key, algo) {
    this.encrptKey = key || 'CEK_Auto1'
    this.encrptAlgo = algo || 'AEAD_AES_256_CBC_HMAC_SHA_256'
    this.fieldWithEncrpyt = `ENCRYPTED WITH 
  (COLUMN_ENCRYPTION_KEY = [${this.encrptKey}], 
  ENCRYPTION_TYPE = Deterministic, 
  ALGORITHM = '${this.encrptAlgo}')`
    this.txtWithEncrypt = `COLLATE Latin1_General_BIN2 ${this.fieldWithEncrpyt}`
  }
}

module.exports = {
  EncryptHelper
}
