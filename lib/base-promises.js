class BasePromises {
  op (f) {
    return new Promise((resolve, reject) => {
      try {
        f((err, v) => {
          if (err) {
            setImmediate(() => reject(err))
          } else {
            setImmediate(() => resolve(v))
          }
        })
      } catch (e) {
        setImmediate(() => reject(e))
      }
    })
  }
}
exports.BasePromises = BasePromises
