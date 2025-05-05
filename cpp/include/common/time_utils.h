// TimeUtils.h
#pragma once
#include <common/platform.h>
#include <common/odbc_common.h>
#include <cstdint>
#include <cassert>
#include <cmath>
#include <limits>
#include <algorithm>

namespace mssql
{

  class TimeUtils
  {
  public:
    // Time conversion constants
    static constexpr int64_t ms_per_second = static_cast<int64_t>(1000);
    static constexpr int64_t ms_per_minute = 60 * ms_per_second;
    static constexpr int64_t ms_per_hour = 60 * ms_per_minute;
    static constexpr int64_t ms_per_day = 24 * ms_per_hour;
    static constexpr int64_t NANOSECONDS_PER_MS = static_cast<int64_t>(1e6); // nanoseconds per millisecond

    // SQL Server year limits
    static constexpr int MIN_YEAR = 1;    // SQL Server's minimum year
    static constexpr int MAX_YEAR = 9999; // SQL Server's maximum year

    // Create SQL date struct from milliseconds since epoch
    static SQL_DATE_STRUCT createDateStruct(double milliseconds, int32_t offset_minutes = 0);

    // Create SQL time struct from milliseconds since epoch
    static SQL_SS_TIME2_STRUCT createTimeStruct(double milliseconds, int32_t offset_minutes = 0);

    // Create SQL timestamp struct from milliseconds since epoch
    static SQL_TIMESTAMP_STRUCT createTimestampStruct(double milliseconds, int32_t offset_minutes = 0);

    // Create SQL timestamp offset struct from milliseconds since epoch
    static void createTimestampOffsetStruct(
        double milliseconds,
        int32_t nanoseconds_delta,
        int32_t offset_minutes,
        SQL_SS_TIMESTAMPOFFSET_STRUCT &result);

  private:
    // Days per month in a normal year (0-based for month indexes 0-12)
    static constexpr int normalYearMonthDays[13] = {0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};

    // Days per month in a leap year (0-based for month indexes 0-12)
    static constexpr int leapYearMonthDays[13] = {0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};

    // Check if a year is a leap year
    static bool isLeapYear(const int year)
    {
      return (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0));
    }
  };

  // Initialize static constants
  constexpr int TimeUtils::normalYearMonthDays[13];
  constexpr int TimeUtils::leapYearMonthDays[13];

} // namespace mssql