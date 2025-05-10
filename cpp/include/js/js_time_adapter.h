#pragma once

#include <node_api.h>

namespace mssql {

	class DatumStorage;
    // A testable version of JSTimeAdapter that's easier to unit test

	class JSTimeAdapter {
    public:

        // Bind a JavaScript Date to a DATE type in DatumStorage
        static bool bindJsDateToDateStorage(napi_env env, napi_value jsDate, DatumStorage& storage, int32_t offset = 0);

        // Bind a JavaScript Date to a TIME type in DatumStorage
        static bool bindJsDateToTimeStorage(napi_env env, napi_value jsDate, DatumStorage& storage, int32_t offset = 0);

        // Bind a JavaScript Date to a TIMESTAMP type in DatumStorage
        static bool bindJsDateToTimestampStorage(napi_env env, napi_value jsDate, DatumStorage& storage, int32_t offset = 0);

        // Bind a JavaScript Date to a TIMESTAMPOFFSET type in DatumStorage
        static bool bindJsDateToTimestampOffsetStorage(napi_env env, napi_value jsDate, DatumStorage& storage, int32_t offset = 0);
        
        // Create a JS Date from a DATE type
        static napi_value createJsDateFromDate(napi_env env, const SQL_DATE_STRUCT& date);
        
        // Create a JS Date from a TIME type
        static napi_value createJsDateFromTime(napi_env env, const SQL_SS_TIME2_STRUCT& time);
        
        // Create a JS Date from a TIMESTAMP type
        static napi_value createJsDateFromTimestamp(napi_env env, const SQL_TIMESTAMP_STRUCT& timestamp);
        
        // Create a JS Date from a TIMESTAMPOFFSET type
        static napi_value createJsDateFromTimestampOffset(napi_env env, const SQL_SS_TIMESTAMPOFFSET_STRUCT& offsetTimestamp);
    };

} // namespace mssql