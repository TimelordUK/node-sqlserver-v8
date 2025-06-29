#pragma once

#include <node_api.h>
#include <sql.h>
#include <sqlext.h>

#include "odbc_common.h"
#include "platform.h"
#include "napi.h"

namespace mssql {

class DatumStorage;
// A testable version of JSTimeAdapter that's easier to unit test

class JSTimeAdapter {
 public:
  // Bind a JavaScript Date to a DATE type in DatumStorage
  static bool bindJsDateToDateStorage(Napi::Env env,
                                      Napi::Value jsDate,
                                      DatumStorage& storage,
                                      int32_t offset = 0);

  // Bind a JavaScript Date to a TIME type in DatumStorage
  static bool bindJsDateToTimeStorage(Napi::Env env,
                                      Napi::Value jsDate,
                                      DatumStorage& storage,
                                      int32_t offset = 0);

  // Bind a JavaScript Date to a TIMESTAMP type in DatumStorage
  static bool bindJsDateToTimestampStorage(Napi::Env env,
                                           Napi::Value jsDate,
                                           DatumStorage& storage,
                                           int32_t offset = 0);

  // Bind a JavaScript Date to a TIMESTAMPOFFSET type in DatumStorage
  static bool bindJsDateToTimestampOffsetStorage(Napi::Env env,
                                                 Napi::Value jsDate,
                                                 DatumStorage& storage,
                                                 int32_t offset = 0);

  // Create a JS Date from a DATE type
  static Napi::Value createJsDateFromDate(Napi::Env env, const SQL_DATE_STRUCT& date);

  // Create a JS Date from a TIME type
  static Napi::Value createJsDateFromTime(Napi::Env env, const SQL_SS_TIME2_STRUCT& time);

  // Create a JS Date from a TIMESTAMP type
  static Napi::Value createJsDateFromTimestamp(Napi::Env env,
                                               const SQL_TIMESTAMP_STRUCT& timestamp);

  // Create a JS Date from a TIMESTAMPOFFSET type
  static Napi::Value createJsDateFromTimestampOffset(
      Napi::Env env, const SQL_SS_TIMESTAMPOFFSET_STRUCT& offsetTimestamp);
};

}  // namespace mssql