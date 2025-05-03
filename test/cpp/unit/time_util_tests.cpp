#include <gtest/gtest.h>
#include "time_utils.h"
using namespace mssql;

TEST(TimeUtilsTest, EpochAndNearbyDates) {
    // Exactly at epoch
    auto epoch = TimeUtils::createDateStruct(0);
    EXPECT_EQ(epoch.year, 1970);
    EXPECT_EQ(epoch.month, 1);
    EXPECT_EQ(epoch.day, 1);

    // One millisecond after epoch
    auto justAfterEpoch = TimeUtils::createDateStruct(1);
    EXPECT_EQ(justAfterEpoch.year, 1970);
    EXPECT_EQ(justAfterEpoch.month, 1);
    EXPECT_EQ(justAfterEpoch.day, 1);

    // One millisecond before epoch
    auto justBeforeEpoch = TimeUtils::createDateStruct(-1);
    EXPECT_EQ(justBeforeEpoch.year, 1969);
    EXPECT_EQ(justBeforeEpoch.month, 12);
    EXPECT_EQ(justBeforeEpoch.day, 31);

    // One day after epoch
    auto oneDayAfter = TimeUtils::createDateStruct(24 * 60 * 60 * 1000.0);
    EXPECT_EQ(oneDayAfter.year, 1970);
    EXPECT_EQ(oneDayAfter.month, 1);
    EXPECT_EQ(oneDayAfter.day, 2);

    // One day before epoch
    auto oneDayBefore = TimeUtils::createDateStruct(-24 * 60 * 60 * 1000.0);
    EXPECT_EQ(oneDayBefore.year, 1969);
    EXPECT_EQ(oneDayBefore.month, 12);
    EXPECT_EQ(oneDayBefore.day, 31);
}

TEST(TimeUtilsTest, YearBoundaries) {
    // December 31, 1969 23:59:59.999
    auto endOf1969 = TimeUtils::createDateStruct(-1);
    EXPECT_EQ(endOf1969.year, 1969);
    EXPECT_EQ(endOf1969.month, 12);
    EXPECT_EQ(endOf1969.day, 31);

    // January 1, 1970 00:00:00.000
    auto startOf1970 = TimeUtils::createDateStruct(0);
    EXPECT_EQ(startOf1970.year, 1970);
    EXPECT_EQ(startOf1970.month, 1);
    EXPECT_EQ(startOf1970.day, 1);

    // December 31, 1970 23:59:59.999
    double msInYear = 365 * 24 * 60 * 60 * 1000.0;
    auto endOf1970 = TimeUtils::createDateStruct(msInYear - 1);
    EXPECT_EQ(endOf1970.year, 1970);
    EXPECT_EQ(endOf1970.month, 12);
    EXPECT_EQ(endOf1970.day, 31);

    // January 1, 1971 00:00:00.000
    auto startOf1971 = TimeUtils::createDateStruct(msInYear);
    EXPECT_EQ(startOf1971.year, 1971);
    EXPECT_EQ(startOf1971.month, 1);
    EXPECT_EQ(startOf1971.day, 1);
}

TEST(TimeUtilsTest, MonthBoundaries) {
    // End of January 1970
    double msInDay = 24 * 60 * 60 * 1000.0;
    auto endOfJan1970 = TimeUtils::createDateStruct(31 * msInDay - 1);
    EXPECT_EQ(endOfJan1970.year, 1970);
    EXPECT_EQ(endOfJan1970.month, 1);
    EXPECT_EQ(endOfJan1970.day, 31);

    // Start of February 1970
    auto startOfFeb1970 = TimeUtils::createDateStruct(31 * msInDay);
    EXPECT_EQ(startOfFeb1970.year, 1970);
    EXPECT_EQ(startOfFeb1970.month, 2);
    EXPECT_EQ(startOfFeb1970.day, 1);

    // End of February 1970 (non-leap year)
    auto endOfFeb1970 = TimeUtils::createDateStruct((31 + 28) * msInDay - 1);
    EXPECT_EQ(endOfFeb1970.year, 1970);
    EXPECT_EQ(endOfFeb1970.month, 2);
    EXPECT_EQ(endOfFeb1970.day, 28);

    // Start of March 1970
    auto startOfMar1970 = TimeUtils::createDateStruct((31 + 28) * msInDay);
    EXPECT_EQ(startOfMar1970.year, 1970);
    EXPECT_EQ(startOfMar1970.month, 3);
    EXPECT_EQ(startOfMar1970.day, 1);
}

TEST(TimeUtilsTest, LeapYearEdgeCases) {
    const double msInDay = 24 * 60 * 60 * 1000.0;

    // February 28 in various years

    // 1900 - not a leap year (divisible by 100 but not 400)
    double yearsSinceEpoch = -70; // 1970 - 70 = 1900
    double daysToFeb28 = 31 + 27; // Jan 31 + Feb 28 - 1
    double ms1900Feb28 = (yearsSinceEpoch * 365 +
        (yearsSinceEpoch / 4) - (yearsSinceEpoch / 100) + (yearsSinceEpoch / 400) +
        daysToFeb28) * msInDay;
    auto date1900Feb28 = TimeUtils::createDateStruct(ms1900Feb28);
    EXPECT_EQ(date1900Feb28.year, 1900);
    EXPECT_EQ(date1900Feb28.month, 2);
    EXPECT_EQ(date1900Feb28.day, 28);

    // Next day should be March 1, 1900
    auto date1900Mar1 = TimeUtils::createDateStruct(ms1900Feb28 + msInDay);
    EXPECT_EQ(date1900Mar1.year, 1900);
    EXPECT_EQ(date1900Mar1.month, 3);
    EXPECT_EQ(date1900Mar1.day, 1);

    // 2000 - is a leap year (divisible by 400)
    double ms2000Feb28 = 951696000000; // Corrected timestamp for Feb 28, 2000
    auto date2000Feb28 = TimeUtils::createDateStruct(ms2000Feb28);
    EXPECT_EQ(date2000Feb28.year, 2000);
    EXPECT_EQ(date2000Feb28.month, 2);
    EXPECT_EQ(date2000Feb28.day, 28);

    // Next day should be February 29, 2000
    auto date2000Feb29 = TimeUtils::createDateStruct(ms2000Feb28 + msInDay);
    EXPECT_EQ(date2000Feb29.year, 2000);
    EXPECT_EQ(date2000Feb29.month, 2);
    EXPECT_EQ(date2000Feb29.day, 29);

    // Following day should be March 1, 2000
    auto date2000Mar1 = TimeUtils::createDateStruct(ms2000Feb28 + 2 * msInDay);
    EXPECT_EQ(date2000Mar1.year, 2000);
    EXPECT_EQ(date2000Mar1.month, 3);
    EXPECT_EQ(date2000Mar1.day, 1);

    // 2100 - not a leap year (divisible by 100 but not 400)
    double ms2100Feb28 = 4107456000000; // Feb 28, 2100
    auto date2100Feb28 = TimeUtils::createDateStruct(ms2100Feb28);
    EXPECT_EQ(date2100Feb28.year, 2100);
    EXPECT_EQ(date2100Feb28.month, 2);
    EXPECT_EQ(date2100Feb28.day, 28);

    // Next day should be March 1, 2100
    auto date2100Mar1 = TimeUtils::createDateStruct(ms2100Feb28 + msInDay);
    EXPECT_EQ(date2100Mar1.year, 2100);
    EXPECT_EQ(date2100Mar1.month, 3);
    EXPECT_EQ(date2100Mar1.day, 1);
}

TEST(TimeUtilsTest, HistoricalDates) {
    // Test some significant historical dates

    // July 4, 1776 (American Independence Day)
    auto independenceDay = TimeUtils::createDateStruct(-6106017600000.0);
    EXPECT_EQ(independenceDay.year, 1776);
    EXPECT_EQ(independenceDay.month, 7);
    EXPECT_EQ(independenceDay.day, 4);

    // January 1, 1900 (A common historical reference point)
    auto year1900 = TimeUtils::createDateStruct(-2208988800000.0);
    EXPECT_EQ(year1900.year, 1900);
    EXPECT_EQ(year1900.month, 1);
    EXPECT_EQ(year1900.day, 1);

    // December 31, 1999 (End of 20th century)
    auto endOf1999 = TimeUtils::createDateStruct(946684799999.0);
    EXPECT_EQ(endOf1999.year, 1999);
    EXPECT_EQ(endOf1999.month, 12);
    EXPECT_EQ(endOf1999.day, 31);

    // January 1, 2000 (Start of 21st century)
    auto startOf2000 = TimeUtils::createDateStruct(946684800000.0);
    EXPECT_EQ(startOf2000.year, 2000);
    EXPECT_EQ(startOf2000.month, 1);
    EXPECT_EQ(startOf2000.day, 1);
}

TEST(TimeUtilsTest, NegativeYears) {
    // SQL Server doesn't support dates before year 1, but your algorithm 
    // should still be robust when handling very negative milliseconds

    // January 1, 1 CE (the earliest valid SQL Server date)
    auto year1 = TimeUtils::createDateStruct(-62167219200000.0);
    EXPECT_EQ(year1.year, 1);
    EXPECT_EQ(year1.month, 1);
    EXPECT_EQ(year1.day, 1);

    // Test with a very large negative number that would theoretically be before year 1
    // The function should either handle this gracefully or return a minimum valid date
    auto veryEarly = TimeUtils::createDateStruct(-63167219200000.0 * 2);
    EXPECT_GE(veryEarly.year, 1); // Year should be at least 1
    EXPECT_GE(veryEarly.month, 1); // Month should be valid (1-12)
    EXPECT_LE(veryEarly.month, 12);
    EXPECT_GE(veryEarly.day, 1); // Day should be valid (1-31)
    EXPECT_LE(veryEarly.day, 31);
}

TEST(TimeUtilsTest, FutureDates) {
    // Test some future dates

    // January 1, 2100
    auto year2100 = TimeUtils::createDateStruct(4102444800000.0);
    EXPECT_EQ(year2100.year, 2100);
    EXPECT_EQ(year2100.month, 1);
    EXPECT_EQ(year2100.day, 1);

    // December 31, 9999 (SQL Server's maximum date)
    auto maxDate = TimeUtils::createDateStruct(252423993599999.0);
    EXPECT_EQ(maxDate.year, 9999);
    EXPECT_EQ(maxDate.month, 12);
    EXPECT_EQ(maxDate.day, 31);

    // Test with a very large number that would theoretically be after year 9999
    // The function should either handle this gracefully or return a maximum valid date
    auto veryFuture = TimeUtils::createDateStruct(252523993599999.0 * 2);
    EXPECT_LE(veryFuture.year, 9999); // Year should not exceed 9999
    EXPECT_GE(veryFuture.month, 1); // Month should be valid (1-12)
    EXPECT_LE(veryFuture.month, 12);
    EXPECT_GE(veryFuture.day, 1); // Day should be valid (1-31)
    EXPECT_LE(veryFuture.day, 31);
}

TEST(TimeUtilsTest, TimeZoneOffsets) {
    const double msInHour = 60 * 60 * 1000.0;

    // Test date with various timezone offsets
    double baseMs = 1577836800000.0; // January 1, 2020 00:00:00 UTC

    // No offset (UTC)
    auto utcDate = TimeUtils::createDateStruct(baseMs, 0);
    EXPECT_EQ(utcDate.year, 2020);
    EXPECT_EQ(utcDate.month, 1);
    EXPECT_EQ(utcDate.day, 1);

    // UTC+1 (1 hour ahead)
    auto plus1Date = TimeUtils::createDateStruct(baseMs, 60);
    EXPECT_EQ(plus1Date.year, 2019);
    EXPECT_EQ(plus1Date.month, 12);
    EXPECT_EQ(plus1Date.day, 31);

    // UTC-8 (Pacific Time)
    auto minus8Date = TimeUtils::createDateStruct(baseMs, -8 * 60);
    EXPECT_EQ(minus8Date.year, 2020);
    EXPECT_EQ(minus8Date.month, 1);
    EXPECT_EQ(minus8Date.day, 1);

    // Test extreme offsets
    // UTC+14 (maximum valid offset)
    auto plus14Date = TimeUtils::createDateStruct(baseMs, 14 * 60);
    EXPECT_EQ(plus14Date.year, 2019);
    EXPECT_EQ(plus14Date.month, 12);
    EXPECT_EQ(plus14Date.day, 31);

    // UTC-12 (maximum negative offset)
    auto minus12Date = TimeUtils::createDateStruct(baseMs, -12 * 60);
    EXPECT_EQ(minus12Date.year, 2020);
    EXPECT_EQ(minus12Date.month, 1);
    EXPECT_EQ(minus12Date.day, 1);
}

TEST(TimeUtilsTest, TimeStructTests) {
    // Basic time tests
    auto midnight = TimeUtils::createTimeStruct(0);
    EXPECT_EQ(midnight.hour, 0);
    EXPECT_EQ(midnight.minute, 0);
    EXPECT_EQ(midnight.second, 0);
    EXPECT_EQ(midnight.fraction, 0);

    // Time with all components
    double ms = 12 * 60 * 60 * 1000.0 + 34 * 60 * 1000.0 + 56 * 1000.0 + 789;
    auto complexTime = TimeUtils::createTimeStruct(ms);
    EXPECT_EQ(complexTime.hour, 12);
    EXPECT_EQ(complexTime.minute, 34);
    EXPECT_EQ(complexTime.second, 56);
    EXPECT_EQ(complexTime.fraction, 789 * TimeUtils::NANOSECONDS_PER_MS);

    // Time from negative date (should still give positive time of day)
    auto timeFromNegative = TimeUtils::createTimeStruct(-12345678);
    // Time of day for negative timestamps should still be valid
    EXPECT_GE(timeFromNegative.hour, 0);
    EXPECT_LT(timeFromNegative.hour, 24);
    EXPECT_GE(timeFromNegative.minute, 0);
    EXPECT_LT(timeFromNegative.minute, 60);
    EXPECT_GE(timeFromNegative.second, 0);
    EXPECT_LT(timeFromNegative.second, 60);

    // Time with timezone offset
    auto timeWithOffset = TimeUtils::createTimeStruct(12 * 60 * 60 * 1000.0, 60); // 12:00 UTC, UTC+1
    EXPECT_EQ(timeWithOffset.hour, 11); // Should be 11:00 in UTC+1
    EXPECT_EQ(timeWithOffset.minute, 0);
    EXPECT_EQ(timeWithOffset.second, 0);

    // Time close to midnight with timezone crossing
    auto almostMidnight = TimeUtils::createTimeStruct(23 * 60 * 60 * 1000.0, 60); // 23:00 UTC, UTC+1
    EXPECT_EQ(almostMidnight.hour, 22); // Should be 22:00 in UTC+1
    EXPECT_EQ(almostMidnight.minute, 0);
    EXPECT_EQ(almostMidnight.second, 0);

    // Edge case: exactly midnight
    auto exactMidnight = TimeUtils::createTimeStruct(0 * 60 * 60 * 1000.0, 0);
    EXPECT_EQ(exactMidnight.hour, 0);
    EXPECT_EQ(exactMidnight.minute, 0);
    EXPECT_EQ(exactMidnight.second, 0);
}

TEST(TimeUtilsTest, TimestampStructTest) {
    // Test with a specific date+time
    double ms = 1613399445123.0; // 2021-02-15 14:30:45.123 UTC
    auto ts = TimeUtils::createTimestampStruct(ms);
    EXPECT_EQ(ts.year, 2021);
    EXPECT_EQ(ts.month, 2);
    EXPECT_EQ(ts.day, 15);
    EXPECT_EQ(ts.hour, 14);
    EXPECT_EQ(ts.minute, 30);
    EXPECT_EQ(ts.second, 45);
    EXPECT_EQ(ts.fraction, 123 * TimeUtils::NANOSECONDS_PER_MS);

    // Test with timezone offset
    auto tsWithOffset = TimeUtils::createTimestampStruct(ms, 60); // UTC+1
    EXPECT_EQ(tsWithOffset.year, 2021);
    EXPECT_EQ(tsWithOffset.month, 2);
    EXPECT_EQ(tsWithOffset.day, 15);
    EXPECT_EQ(tsWithOffset.hour, 13); // One hour earlier due to UTC+1
    EXPECT_EQ(tsWithOffset.minute, 30);
    EXPECT_EQ(tsWithOffset.second, 45);
    EXPECT_EQ(tsWithOffset.fraction, 123 * TimeUtils::NANOSECONDS_PER_MS);

    // Test with midnight crossing due to timezone
    double midnightMs = 1613347200000.0; // 2021-02-15 00:00:00 UTC
    auto tsMidnightOffset = TimeUtils::createTimestampStruct(midnightMs, 60); // UTC+1
    EXPECT_EQ(tsMidnightOffset.year, 2021);
    EXPECT_EQ(tsMidnightOffset.month, 2);
    EXPECT_EQ(tsMidnightOffset.day, 14); // Previous day due to timezone
    EXPECT_EQ(tsMidnightOffset.hour, 23); // 23:00 previous day
    EXPECT_EQ(tsMidnightOffset.minute, 0);
    EXPECT_EQ(tsMidnightOffset.second, 0);

    // Test with a negative timestamp
    double negativeMs = -1613399445123.0;
    auto tsNegative = TimeUtils::createTimestampStruct(negativeMs);
    // Should still produce a valid date and time
    EXPECT_GE(tsNegative.year, 1);
    EXPECT_LE(tsNegative.year, 9999);
    EXPECT_GE(tsNegative.month, 1);
    EXPECT_LE(tsNegative.month, 12);
    EXPECT_GE(tsNegative.day, 1);
    EXPECT_LE(tsNegative.day, 31);
    EXPECT_GE(tsNegative.hour, 0);
    EXPECT_LE(tsNegative.hour, 23);
    EXPECT_GE(tsNegative.minute, 0);
    EXPECT_LE(tsNegative.minute, 59);
    EXPECT_GE(tsNegative.second, 0);
    EXPECT_LE(tsNegative.second, 59);
}

TEST(TimeUtilsTest, TimestampOffsetStructTest) {
    // Test with specific date+time and timezone offset
    double ms = 1613400645123.0; // 2021-02-15 14:50:45.123 UTC
    SQL_SS_TIMESTAMPOFFSET_STRUCT ts;

    // UTC+1
    TimeUtils::createTimestampOffsetStruct(ms, 0, 60, ts);
    EXPECT_EQ(ts.year, 2021);
    EXPECT_EQ(ts.month, 2);
    EXPECT_EQ(ts.day, 15);
    EXPECT_EQ(ts.hour, 14);
    EXPECT_EQ(ts.minute, 50);
    EXPECT_EQ(ts.second, 45);
    EXPECT_EQ(ts.fraction, 123 * TimeUtils::NANOSECONDS_PER_MS);
    EXPECT_EQ(ts.timezone_hour, 1);
    EXPECT_EQ(ts.timezone_minute, 0);

    // UTC-5 (Eastern Standard Time)
    TimeUtils::createTimestampOffsetStruct(ms, 0, -5 * 60, ts);
    EXPECT_EQ(ts.year, 2021);
    EXPECT_EQ(ts.month, 2);
    EXPECT_EQ(ts.day, 15);
    EXPECT_EQ(ts.hour, 14);
    EXPECT_EQ(ts.minute, 50);
    EXPECT_EQ(ts.second, 45);
    EXPECT_EQ(ts.fraction, 123 * TimeUtils::NANOSECONDS_PER_MS);
    EXPECT_EQ(ts.timezone_hour, -5);
    EXPECT_EQ(ts.timezone_minute, 0);

    // Test with non-zero minutes in timezone offset: UTC+5:30 (India)
    TimeUtils::createTimestampOffsetStruct(ms, 0, 5 * 60 + 30, ts);
    EXPECT_EQ(ts.timezone_hour, 5);
    EXPECT_EQ(ts.timezone_minute, 30);

    // Test with nanoseconds_delta
    int32_t nanosDelta = 500 * 1000; // 500,000 nanoseconds
    TimeUtils::createTimestampOffsetStruct(ms, nanosDelta, 0, ts);
    EXPECT_EQ(ts.fraction, 123 * TimeUtils::NANOSECONDS_PER_MS + nanosDelta);
}

TEST(TimeUtilsTest, ExtremeValues) {
    // Already tested in the original tests, but adding a few more cases:

    // January 1, 0001 00:00:00.000 (SQL Server minimum date)
    auto minDate = TimeUtils::createDateStruct(-62167219200000.0);
    EXPECT_EQ(minDate.year, 1);
    EXPECT_EQ(minDate.month, 1);
    EXPECT_EQ(minDate.day, 1);

    // December 31, 9999 23:59:59.997 (SQL Server maximum date)
    auto maxDate = TimeUtils::createDateStruct(252423993599999.0);
    EXPECT_EQ(maxDate.year, 9999);
    EXPECT_EQ(maxDate.month, 12);
    EXPECT_EQ(maxDate.day, 31);

    // Test timestamp for min date
    auto minTimestamp = TimeUtils::createTimestampStruct(-62167219200000.0);
    EXPECT_EQ(minTimestamp.year, 1);
    EXPECT_EQ(minTimestamp.month, 1);
    EXPECT_EQ(minTimestamp.day, 1);
    EXPECT_EQ(minTimestamp.hour, 0);
    EXPECT_EQ(minTimestamp.minute, 0);
    EXPECT_EQ(minTimestamp.second, 0);

    // Test timestamp for max date
    auto maxTimestamp = TimeUtils::createTimestampStruct(253402300799999.0);
    EXPECT_EQ(maxTimestamp.year, 9999);
    EXPECT_EQ(maxTimestamp.month, 12);
    EXPECT_EQ(maxTimestamp.day, 31);
    EXPECT_EQ(maxTimestamp.hour, 23);
    EXPECT_EQ(maxTimestamp.minute, 59);
    EXPECT_EQ(maxTimestamp.second, 59);
}

TEST(TimeUtilsTest, PrecisionConsistency) {
    // Test that adding/subtracting exactly one day works consistently
    const double msInDay = 24 * 60 * 60 * 1000.0;

    // Test several dates to make sure adding a day always gives the next day
    // and works consistently across month and year boundaries

    // Regular day - Jan 15, 2020
    double janMs = 1579046400000.0;
    auto jan15 = TimeUtils::createDateStruct(janMs);
    auto jan16 = TimeUtils::createDateStruct(janMs + msInDay);
    EXPECT_EQ(jan15.year, 2020);
    EXPECT_EQ(jan15.month, 1);
    EXPECT_EQ(jan15.day, 15);
    EXPECT_EQ(jan16.year, 2020);
    EXPECT_EQ(jan16.month, 1);
    EXPECT_EQ(jan16.day, 16);

    // Month end - Jan 31, 2020
    double jan31Ms = 1580428800000.0;
    auto jan31 = TimeUtils::createDateStruct(jan31Ms);
    auto feb1 = TimeUtils::createDateStruct(jan31Ms + msInDay);
    EXPECT_EQ(jan31.year, 2020);
    EXPECT_EQ(jan31.month, 1);
    EXPECT_EQ(jan31.day, 31);
    EXPECT_EQ(feb1.year, 2020);
    EXPECT_EQ(feb1.month, 2);
    EXPECT_EQ(feb1.day, 1);

    // Year end - Dec 31, 2020
    double dec31Ms = 1609372800000.0; // Corrected timestamp for Dec 31, 2020
    auto dec31 = TimeUtils::createDateStruct(dec31Ms);
    auto jan1_2021 = TimeUtils::createDateStruct(dec31Ms + msInDay);
    EXPECT_EQ(dec31.year, 2020);
    EXPECT_EQ(dec31.month, 12);
    EXPECT_EQ(dec31.day, 31);
    EXPECT_EQ(jan1_2021.year, 2021);
    EXPECT_EQ(jan1_2021.month, 1);
    EXPECT_EQ(jan1_2021.day, 1);

    // Going backwards - Jan 1, 2020
    double jan1Ms = 1577836800000.0;
    auto jan1 = TimeUtils::createDateStruct(jan1Ms);
    auto dec31_2019 = TimeUtils::createDateStruct(jan1Ms - msInDay);
    EXPECT_EQ(jan1.year, 2020);
    EXPECT_EQ(jan1.month, 1);
    EXPECT_EQ(jan1.day, 1);
    EXPECT_EQ(dec31_2019.year, 2019);
    EXPECT_EQ(dec31_2019.month, 12);
    EXPECT_EQ(dec31_2019.day, 31);
}

TEST(TimeUtilsTest, FractionPrecision) {
    // Test various fraction (nanosecond) values

    // 1 millisecond = 1,000,000 nanoseconds
    double ms1 = 1.0;
    auto time1ms = TimeUtils::createTimeStruct(ms1);
    EXPECT_EQ(time1ms.fraction, 1 * TimeUtils::NANOSECONDS_PER_MS);

    // 0.1 milliseconds = 100,000 nanoseconds (not exactly representable in binary)
    double ms0_1 = 0.1;
    auto time0_1ms = TimeUtils::createTimeStruct(ms0_1);
    // Due to floating point imprecision, we need to check approximately
    EXPECT_GE(time0_1ms.fraction, 0.09 * TimeUtils::NANOSECONDS_PER_MS);
    EXPECT_LE(time0_1ms.fraction, 0.11 * TimeUtils::NANOSECONDS_PER_MS);

    // 999 milliseconds
    double ms999 = 999.0;
    auto time999ms = TimeUtils::createTimeStruct(ms999);
    EXPECT_EQ(time999ms.fraction, 999 * TimeUtils::NANOSECONDS_PER_MS);

    // Verify that timestamp fractions work properly
    double timeWithFraction = 1613399445123.0; // 123 milliseconds
    auto tsWithFraction = TimeUtils::createTimestampStruct(timeWithFraction);
    EXPECT_EQ(tsWithFraction.fraction, 123 * TimeUtils::NANOSECONDS_PER_MS);
}

// Test with incorrect/invalid inputs (robustness)
TEST(TimeUtilsTest, RobustnessTests) {
    // Very large double value
    auto veryLarge = TimeUtils::createDateStruct(std::numeric_limits<double>::max());
    // Should not crash and should return a valid date
    EXPECT_GE(veryLarge.year, 1);
    EXPECT_LE(veryLarge.year, 9999);
    EXPECT_GE(veryLarge.month, 1);
    EXPECT_LE(veryLarge.month, 12);
    EXPECT_GE(veryLarge.day, 1);
    EXPECT_LE(veryLarge.day, 31);

    // NaN
    auto nan = TimeUtils::createDateStruct(std::numeric_limits<double>::quiet_NaN());
    // Should not crash and should return a valid date
    EXPECT_GE(nan.year, 1);
    EXPECT_LE(nan.year, 9999);
    EXPECT_GE(nan.month, 1);
    EXPECT_LE(nan.month, 12);
    EXPECT_GE(nan.day, 1);
    EXPECT_LE(nan.day, 31);

    // Infinity
    auto inf = TimeUtils::createDateStruct(std::numeric_limits<double>::infinity());
    // Should not crash and should return a valid date
    EXPECT_GE(inf.year, 1);
    EXPECT_LE(inf.year, 9999);
    EXPECT_GE(inf.month, 1);
    EXPECT_LE(inf.month, 12);
    EXPECT_GE(inf.day, 1);
    EXPECT_LE(inf.day, 31);
}