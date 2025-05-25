#pragma once

#include <platform.h>

#include <sql.h>
#include <sqlext.h>

#include <memory>
#include <string>
#include <vector>

namespace mssql {

class StringUtils {
 public:
  inline static vector<SQLWCHAR> wstr2wcvec(const wstring& s) {
    vector<SQLWCHAR> ret;
    ret.reserve(s.size());
    for (auto ch : s) {
      ret.push_back(static_cast<SQLWCHAR>(ch));
    }
    return ret;
  }
  // Convert UTF-8 string to UTF-16 vector
  static std::shared_ptr<std::vector<uint16_t>> Utf8ToUtf16(const std::string& utf8Str);

  // Convert between UTF-8 and std::u16string (proper C++11 Unicode strings)
  static std::u16string Utf8ToU16String(const std::string& utf8Str);
  static std::string U16StringToUtf8(const std::u16string& u16Str);

  // Convert SQLWCHAR array to UTF-8 string
  static std::string WideToUtf8(const SQLWCHAR* wideStr, SQLSMALLINT length);
  static std::string SafeWideToUtf8ForLogging(const SQLWCHAR* wstr, size_t maxLen = 1000);

  // Sanitize connection string for logging (masks passwords)
  static std::string SanitizeConnectionString(const std::string& connStr);

 private:
  // Helper functions for UTF-8 to UTF-16 conversion
  static bool IsUtf8ContinuationByte(unsigned char byte);
  static int GetUtf8SequenceLength(unsigned char firstByte);
  static uint32_t DecodeUtf8Sequence(const char* sequence, int length);
  static void EncodeUtf16(uint32_t codePoint, std::vector<uint16_t>& output);
};

}  // namespace mssql