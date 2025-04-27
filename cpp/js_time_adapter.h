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
    };

} // namespace mssql