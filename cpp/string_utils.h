#pragma once
#include <string>
#include <vector>
#include <memory>
#include <sql.h>
#include <sqlext.h>

namespace mssql
{

  class StringUtils
  {
  public:
    // Convert UTF-8 string to UTF-16 vector
    static std::shared_ptr<std::vector<uint16_t>> Utf8ToUtf16(const std::string &utf8Str);

    // Convert SQLWCHAR array to UTF-8 string
    static std::string WideToUtf8(const SQLWCHAR *wideStr, SQLSMALLINT length);

  private:
    // Helper functions for UTF-8 to UTF-16 conversion
    static bool IsUtf8ContinuationByte(unsigned char byte);
    static int GetUtf8SequenceLength(unsigned char firstByte);
    static uint32_t DecodeUtf8Sequence(const char *sequence, int length);
    static void EncodeUtf16(uint32_t codePoint, std::vector<uint16_t> &output);
  };

} // namespace mssql