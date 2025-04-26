// JSTimeAdapter.h
#pragma once
#include <node_api.h>
#include "time_utils.h"
#include "datum_storage.h"

namespace mssql {

    class JSTimeAdapter {
    public:
        // Bind a JavaScript Date to a DATE type in DatumStorage
        static void bindJsDateToDateStorage(napi_env env, napi_value jsDate, DatumStorage& storage, int32_t offset = 0) {
            if (storage.getType() != DatumStorage::SqlType::Date) {
                storage.setType(DatumStorage::SqlType::Date);
            }

            double milliseconds;
            napi_status status = napi_get_date_value(env, jsDate, &milliseconds);
            if (status != napi_ok) {
                // Handle error (e.g., throw an exception)
                // For simplicity, I'm not including error handling details
                return;
            }

            // Adjust for timezone if needed
            milliseconds -= offset * 60000;

            SQL_DATE_STRUCT date = TimeUtils::createDateStruct(milliseconds, offset);
            storage.addValue(date);
        }

        // Bind a JavaScript Date to a TIME type in DatumStorage
        static void bindJsDateToTimeStorage(napi_env env, napi_value jsDate, DatumStorage& storage, int32_t offset = 0) {
            if (storage.getType() != DatumStorage::SqlType::Time) {
                storage.setType(DatumStorage::SqlType::Time);
            }

            double milliseconds;
            napi_status status = napi_get_date_value(env, jsDate, &milliseconds);
            if (status != napi_ok) {
                // Handle error
                return;
            }

            // Adjust for timezone if needed
            milliseconds -= offset * 60000;

            SQL_SS_TIME2_STRUCT time = TimeUtils::createTimeStruct(milliseconds, offset);
            storage.addValue(time);
        }

        // Bind a JavaScript Date to a TIMESTAMP type in DatumStorage
        static void bindJsDateToTimestampStorage(napi_env env, napi_value jsDate, DatumStorage& storage, int32_t offset = 0) {
            if (storage.getType() != DatumStorage::SqlType::DateTime && storage.getType() != DatumStorage::SqlType::DateTime2) {
                storage.setType(DatumStorage::SqlType::DateTime2);
            }

            double milliseconds;
            napi_status status = napi_get_date_value(env, jsDate, &milliseconds);
            if (status != napi_ok) {
                // Handle error
                return;
            }

            // Adjust for timezone if needed
            milliseconds -= offset * 60000;

            SQL_TIMESTAMP_STRUCT timestamp = TimeUtils::createTimestampStruct(milliseconds, offset);
            storage.addValue<SQL_TIMESTAMP_STRUCT>(timestamp);
        }

        // Bind a JavaScript Date to a TIMESTAMPOFFSET type in DatumStorage
        static void bindJsDateToTimestampOffsetStorage(napi_env env, napi_value jsDate, DatumStorage& storage, int32_t offset = 0) {
            if (storage.getType() != DatumStorage::SqlType::DateTimeOffset) {
                storage.setType(DatumStorage::SqlType::DateTimeOffset);
            }

            double milliseconds;
            napi_status status = napi_get_date_value(env, jsDate, &milliseconds);
            if (status != napi_ok) {
                // Handle error
                return;
            }

            SQL_SS_TIMESTAMPOFFSET_STRUCT timestampOffset;
            TimeUtils::createTimestampOffsetStruct(milliseconds, 0, offset, timestampOffset);
            storage.addValue<SQL_SS_TIMESTAMPOFFSET_STRUCT>(timestampOffset);
        }

        // Array versions
        static void bindJsDateArrayToDateStorage(napi_env env, napi_value jsDateArray, DatumStorage& storage, int32_t offset = 0) {
            if (storage.getType() != DatumStorage::SqlType::Date) {
                storage.setType(DatumStorage::SqlType::Date);
            }

            uint32_t length;
            napi_status status = napi_get_array_length(env, jsDateArray, &length);
            if (status != napi_ok) {
                // Handle error
                return;
            }

            // Reserve space for efficiency
            auto vec = storage.getTypedVector<SQL_DATE_STRUCT>();
            vec->reserve(vec->size() + length);

            for (uint32_t i = 0; i < length; i++) {
                napi_value element;
                status = napi_get_element(env, jsDateArray, i, &element);
                if (status != napi_ok) continue;

                napi_valuetype valueType;
                status = napi_typeof(env, element, &valueType);
                if (status != napi_ok) continue;

                if (valueType == napi_null || valueType == napi_undefined) {
                    // Handle null/undefined values - add a zeroed date
                    SQL_DATE_STRUCT nullDate = { 0 };
                    storage.addValue<SQL_DATE_STRUCT>(nullDate);
                }
                else if (valueType == napi_object) {
                    // Check if it's a Date object
                    bool isDate;
                    status = napi_is_date(env, element, &isDate);
                    if (status != napi_ok || !isDate) continue;

                    double milliseconds;
                    status = napi_get_date_value(env, element, &milliseconds);
                    if (status != napi_ok) continue;

                    // Adjust for timezone if needed
                    milliseconds -= offset * 60000;

                    SQL_DATE_STRUCT date = TimeUtils::createDateStruct(milliseconds, offset);
                    storage.addValue<SQL_DATE_STRUCT>(date);
                }
            }
        }

        // Similar implementations for other array types
        static void bindJsDateArrayToTimeStorage(napi_env env, napi_value jsDateArray, DatumStorage& storage, int32_t offset = 0) {
            // Implementation similar to bindJsDateArrayToDateStorage but for Time type
        }

        static void bindJsDateArrayToTimestampStorage(napi_env env, napi_value jsDateArray, DatumStorage& storage, int32_t offset = 0) {
            // Implementation similar to bindJsDateArrayToDateStorage but for Timestamp type
        }

        static void bindJsDateArrayToTimestampOffsetStorage(napi_env env, napi_value jsDateArray, DatumStorage& storage, int32_t offset = 0) {
            // Implementation similar to bindJsDateArrayToDateStorage but for TimestampOffset type
        }
    };

} // namespace mssql