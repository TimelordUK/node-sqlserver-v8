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

  getUTCDate (date) {
    const localDate = date || new Date()
    const smalldt = new Date(Date.UTC(localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
      0,
      0,
      0,
      0))
    return smalldt
  }

  getUTCDateHH (date) {
    const localDate = date || new Date()
    const smalldt = new Date(Date.UTC(localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
      localDate.getUTCHours(),
      0,
      0,
      0))
    return smalldt
  }

  getUTCDateHHMM (date) {
    const localDate = date || new Date()
    const smalldt = new Date(Date.UTC(localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
      localDate.getUTCHours(),
      localDate.getUTCMinutes(),
      0,
      0))
    return smalldt
  }

  makeUTCJan1900HH (expectedHour) {
    return new Date(Date.UTC(1900, 0, 1, expectedHour, 0, 0, 0))
  }

  makeUTCJan1900HHMM (expectedHour, expectedMinute) {
    return new Date(Date.UTC(1900, 0, 1, expectedHour, expectedMinute, 0, 0))
  }

  makeUTCJan1900HHMMSS (expectedHour, expectedMinute, expectedSecond) {
    return new Date(Date.UTC(1900, 0, 1, expectedHour, expectedMinute, expectedSecond, 0))
  }

  makeUTCJan1900HHMMSSMS (expectedHour, expectedMinute, expectedSecond, expectedms) {
    return new Date(Date.UTC(1900, 0, 1, expectedHour, expectedMinute, expectedSecond, expectedms))
  }

  makeUTCDateHHMMSS (tzYear, tzMonth, tzDay, tzHour, tzMinute, tzSecond) {
    return new Date(Date.UTC(tzYear, tzMonth, tzDay, tzHour, tzMinute, tzSecond))
  }

  getUTCDateTime (date) {
    const localDate = date || new Date()
    return new Date(Date.UTC(localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
      localDate.getUTCHours(),
      localDate.getUTCMinutes(),
      localDate.getUTCSeconds(),
      localDate.getUTCMilliseconds()))
  }

  getUTCDateHHMMSS (date) {
    const localDate = date || new Date()
    return new Date(Date.UTC(localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
      localDate.getUTCHours(),
      localDate.getUTCMinutes(),
      localDate.getUTCSeconds(),
      0))
  }

  getUTCTime (a) {
    const localDate = new Date()
    return Date.UTC(
      localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
      a.getUTCHours(),
      a.getMinutes(),
      a.getSeconds(),
      0)
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
