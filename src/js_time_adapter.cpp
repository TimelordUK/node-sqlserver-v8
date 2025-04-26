#include <platform.h>
#include "datum_storage.h"
#include "napi_wrapper.h"
#include "js_time_adapter.h"
#include "time_utils.h"

namespace mssql {

         bool JSTimeAdapter::bindJsDateToDateStorage(napi_env env, napi_value jsDate, DatumStorage& storage, int32_t offset) {
            if (storage.getType() != DatumStorage::SqlType::Date) {
                storage.setType(DatumStorage::SqlType::Date);
            }

            double milliseconds;
            // Use the wrapper instead of direct N-API call
            napi_status status = NapiWrapper::GetDateValueImpl(env, jsDate, &milliseconds);
            if (status != napi_ok) {
                return false;
            }

            SQL_DATE_STRUCT date = TimeUtils::createDateStruct(milliseconds, offset);
            storage.addValue(date);
            return true;
        }

        // Bind a JavaScript Date to a TIME type in DatumStorage
         bool JSTimeAdapter::bindJsDateToTimeStorage(napi_env env, napi_value jsDate, DatumStorage& storage, int32_t offset) {
            if (storage.getType() != DatumStorage::SqlType::Time) {
                storage.setType(DatumStorage::SqlType::Time);
            }

            double milliseconds;
            napi_status status = napi_get_date_value(env, jsDate, &milliseconds);
            if (status != napi_ok) {
                return false;
            }

            SQL_SS_TIME2_STRUCT time = TimeUtils::createTimeStruct(milliseconds, offset);
            storage.addValue(time);
            return true;
        }

        // Bind a JavaScript Date to a TIMESTAMP type in DatumStorage
        bool JSTimeAdapter::bindJsDateToTimestampStorage(napi_env env, napi_value jsDate, DatumStorage& storage, int32_t offset) {
            if (storage.getType() != DatumStorage::SqlType::DateTime &&
                storage.getType() != DatumStorage::SqlType::DateTime2) {
                storage.setType(DatumStorage::SqlType::DateTime2);
            }

            double milliseconds;
            napi_status status = napi_get_date_value(env, jsDate, &milliseconds);
            if (status != napi_ok) {
                return false;
            }

            SQL_TIMESTAMP_STRUCT timestamp = TimeUtils::createTimestampStruct(milliseconds, offset);
            storage.addValue<SQL_TIMESTAMP_STRUCT>(timestamp);
            return true;
        }

        // Bind a JavaScript Date to a TIMESTAMPOFFSET type in DatumStorage
         bool JSTimeAdapter::bindJsDateToTimestampOffsetStorage(napi_env env, napi_value jsDate, DatumStorage& storage, int32_t offset) {
            if (storage.getType() != DatumStorage::SqlType::DateTimeOffset) {
                storage.setType(DatumStorage::SqlType::DateTimeOffset);
            }

            double milliseconds;
            napi_status status = napi_get_date_value(env, jsDate, &milliseconds);
            if (status != napi_ok) {
                return false;
            }

            SQL_SS_TIMESTAMPOFFSET_STRUCT timestampOffset;
            TimeUtils::createTimestampOffsetStruct(milliseconds, 0, offset, timestampOffset);
            storage.addValue<SQL_SS_TIMESTAMPOFFSET_STRUCT>(timestampOffset);
            return true;
        }

} // namespace mssql