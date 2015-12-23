#include <v8.h>
#include "Column.h"
#include <sql.h>

#pragma once
#include <sqlncli.h>

#pragma once

namespace mssql
{
    using namespace std;

    // Timestamps return dates in UTC timezone
    class TimestampColumn : public Column
    {
    public:

	   TimestampColumn(SQL_SS_TIMESTAMPOFFSET_STRUCT const& timeStruct)
	   {
		  MillisecondsFromDate(timeStruct);
	   }

	   TimestampColumn(double ms, int32_t delta = 0) :
		  milliseconds(ms),
		  nanoseconds_delta(delta)
	   {
	   }

	   Handle<Value> ToValue() override
	   {
		  nodeTypeFactory fact;
		  auto dd = fact.newDate(milliseconds, nanoseconds_delta);
		  return dd;
	   }

	   void ToTimestampOffset(SQL_SS_TIMESTAMPOFFSET_STRUCT& date)
	   {
		  DateFromMilliseconds(date);
	   }

	   static const int64_t NANOSECONDS_PER_MS = 1000000;                  // nanoseconds per millisecond

    private:

	   double milliseconds;
	   int32_t nanoseconds_delta;    // just the fractional part of the time passed in, not since epoch time

	   // return the number of days since Jan 1, 1970
	   double DaysSinceEpoch(SQLSMALLINT y, SQLUSMALLINT m, SQLUSMALLINT d) const;

	   // derived from ECMA 262 15.9
	   void MillisecondsFromDate(SQL_SS_TIMESTAMPOFFSET_STRUCT const& timeStruct);

	   // return the year from the epoch time.  The remainder is returned in the day parameter
	   static int64_t YearFromDay(int64_t& day);

	   // calculate the individual components of a date from the total milliseconds
	   // since Jan 1, 1970
	   void DateFromMilliseconds(SQL_SS_TIMESTAMPOFFSET_STRUCT& date) const;
    };
}