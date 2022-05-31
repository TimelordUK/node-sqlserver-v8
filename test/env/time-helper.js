class TimeHelper {
  parseTime (ds) {
    const [hours, minutes, seconds] = ds.split(':') // Using ES6 destructuring
    // var time = "18:19:02".split(':'); // "Old" ES5 version
    const d = new Date()
    d.setHours(+hours) // Set the hours, using implicit type coercion
    d.setMinutes(minutes) // You can pass Number or String. It doesn't really matter
    d.setSeconds(seconds)
    d.setMilliseconds(0)
    return d
  }

  getUTCDateTime (date) {
    const localDate = date || new Date()
    const utcDate = new Date(Date.UTC(localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
      localDate.getUTCHours(),
      localDate.getUTCMinutes(),
      localDate.getUTCSeconds(),
      localDate.getUTCMilliseconds()))
    return utcDate
  }

  getUTCTime (a) {
    const localDate = new Date()
    const today = Date.UTC(
      localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
      a.getUTCHours(),
      a.getMinutes(),
      a.getSeconds(),
      0)
    return today
  }

  toUTCDate (localDate) {
    return new Date(
      Date.UTC(
        localDate.getUTCFullYear(),
        localDate.getUTCMonth(),
        localDate.getUTCDate(),
        localDate.getUTCHours(),
        0,
        0,
        0))
  }

  addDays (days) {
    const localDate = new Date()
    const utcDate = this.toUTCDate(localDate)
    const result = new Date(utcDate)
    result.setDate(result.getDate() + days)
    return result
  }
}

module.exports = {
  TimeHelper
}
