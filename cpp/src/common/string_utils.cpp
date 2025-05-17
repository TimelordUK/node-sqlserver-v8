#include <platform.h>
#include <common/odbc_common.h>
#include <common/string_utils.h>

#include <utils/Logger.h>

#include <codecvt>
#include <locale>
#include <stdexcept>

namespace mssql {

bool StringUtils::IsUtf8ContinuationByte(unsigned char byte) {
  return (byte & 0xC0) == 0x80;
}

int StringUtils::GetUtf8SequenceLength(unsigned char firstByte) {
  if ((firstByte & 0x80) == 0)
    return 1;
  if ((firstByte & 0xE0) == 0xC0)
    return 2;
  if ((firstByte & 0xF0) == 0xE0)
    return 3;
  if ((firstByte & 0xF8) == 0xF0)
    return 4;
  return 0;  // Invalid sequence
}

uint32_t StringUtils::DecodeUtf8Sequence(const char* sequence, int length) {
  uint32_t codePoint;

  switch (length) {
    case 1:
      return static_cast<unsigned char>(sequence[0]);
    case 2:
      codePoint = ((sequence[0] & 0x1F) << 6) | (sequence[1] & 0x3F);
      break;
    case 3:
      codePoint = ((sequence[0] & 0x0F) << 12) | ((sequence[1] & 0x3F) << 6) | (sequence[2] & 0x3F);
      break;
    case 4:
      codePoint = ((sequence[0] & 0x07) << 18) | ((sequence[1] & 0x3F) << 12) |
                  ((sequence[2] & 0x3F) << 6) | (sequence[3] & 0x3F);
      break;
    default:
      throw std::runtime_error("Invalid UTF-8 sequence length");
  }

  return codePoint;
}

void StringUtils::EncodeUtf16(uint32_t codePoint, std::vector<uint16_t>& output) {
  if (codePoint <= 0xFFFF) {
    output.push_back(static_cast<uint16_t>(codePoint));
  } else if (codePoint <= 0x10FFFF) {
    codePoint -= 0x10000;
    output.push_back(static_cast<uint16_t>(0xD800 + (codePoint >> 10)));
    output.push_back(static_cast<uint16_t>(0xDC00 + (codePoint & 0x3FF)));
  } else {
    throw std::runtime_error("Invalid Unicode code point");
  }
}

std::shared_ptr<std::vector<uint16_t>> StringUtils::Utf8ToUtf16(const std::string& utf8Str) {
  auto result = std::make_shared<std::vector<uint16_t>>();
  const char* str = utf8Str.c_str();
  size_t len = utf8Str.length();
  size_t i = 0;

  while (i < len) {
    int seqLen = GetUtf8SequenceLength(str[i]);
    if (seqLen == 0 || i + seqLen > len) {
      throw std::runtime_error("Invalid UTF-8 sequence");
    }

    uint32_t codePoint = DecodeUtf8Sequence(str + i, seqLen);
    EncodeUtf16(codePoint, *result);
    i += seqLen;
  }

  return result;
}

std::u16string StringUtils::Utf8ToU16String(const std::string& utf8Str) {
#ifdef PLATFORM_WINDOWS
  // On Windows, we've silenced the warnings with _SILENCE_CXX17_CODECVT_HEADER_DEPRECATION_WARNING
  try {
    std::wstring_convert<std::codecvt_utf8_utf16<char16_t>, char16_t> converter;
    return converter.from_bytes(utf8Str);
  } catch (const std::exception&) {
    // Fall through to manual implementation on exception
  }
#endif

  // Fallback implementation for all platforms
  std::u16string result;
  result.reserve(utf8Str.size());  // Reserve at least as many chars as the UTF-8 string

  const char* str = utf8Str.c_str();
  size_t len = utf8Str.length();
  size_t i = 0;

  while (i < len) {
    // For ASCII characters (most common in SQL), fast path
    if ((unsigned char)str[i] <= 0x7F) {
      result.push_back(static_cast<char16_t>(str[i]));
      i++;
      continue;
    }

    try {
      int seqLen = GetUtf8SequenceLength(str[i]);
      if (seqLen == 0 || i + seqLen > len) {
        // Invalid sequence, just add a replacement character
        result.push_back(u'\uFFFD');
        i++;
        continue;
      }

      uint32_t codePoint = DecodeUtf8Sequence(str + i, seqLen);

      // For BMP characters (U+0000 to U+FFFF)
      if (codePoint <= 0xFFFF) {
        result.push_back(static_cast<char16_t>(codePoint));
      }
      // For supplementary characters (U+10000 to U+10FFFF)
      else if (codePoint <= 0x10FFFF) {
        // Encode as surrogate pair
        codePoint -= 0x10000;
        result.push_back(static_cast<char16_t>(0xD800 + (codePoint >> 10)));
        result.push_back(static_cast<char16_t>(0xDC00 + (codePoint & 0x3FF)));
      } else {
        // Invalid code point, add replacement character
        result.push_back(u'\uFFFD');
      }

      i += seqLen;
    } catch (const std::exception&) {
      // Handle any exceptions during decoding
      result.push_back(u'\uFFFD');
      i++;
    }
  }

  return result;
}

std::string StringUtils::U16StringToUtf8(const std::u16string& u16Str) {
#ifdef PLATFORM_WINDOWS
  // On Windows, we've silenced the warnings with _SILENCE_CXX17_CODECVT_HEADER_DEPRECATION_WARNING
  try {
    std::wstring_convert<std::codecvt_utf8_utf16<char16_t>, char16_t> converter;
    return converter.to_bytes(u16Str);
  } catch (const std::exception&) {
    // Fall through to manual implementation on exception
  }
#endif

  // Fallback implementation for all platforms
  std::string result;
  result.reserve(u16Str.size() * 3);  // Reserve space for worst case (3 bytes per char)

  for (size_t i = 0; i < u16Str.size(); i++) {
    char16_t c = u16Str[i];

    // Handle surrogate pairs
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < u16Str.size()) {
      char16_t c2 = u16Str[i + 1];
      if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
        // Valid surrogate pair, decode to code point
        uint32_t codePoint = 0x10000 + (((c - 0xD800) << 10) | (c2 - 0xDC00));

        // 4-byte UTF-8 sequence
        result.push_back(static_cast<char>(0xF0 | (codePoint >> 18)));
        result.push_back(static_cast<char>(0x80 | ((codePoint >> 12) & 0x3F)));
        result.push_back(static_cast<char>(0x80 | ((codePoint >> 6) & 0x3F)));
        result.push_back(static_cast<char>(0x80 | (codePoint & 0x3F)));

        i++;  // Skip the second surrogate
        continue;
      }
    }

    // BMP characters
    if (c <= 0x7F) {
      // ASCII character
      result.push_back(static_cast<char>(c));
    } else if (c <= 0x7FF) {
      // 2-byte sequence
      result.push_back(static_cast<char>(0xC0 | (c >> 6)));
      result.push_back(static_cast<char>(0x80 | (c & 0x3F)));
    } else {
      // 3-byte sequence
      result.push_back(static_cast<char>(0xE0 | (c >> 12)));
      result.push_back(static_cast<char>(0x80 | ((c >> 6) & 0x3F)));
      result.push_back(static_cast<char>(0x80 | (c & 0x3F)));
    }
  }

  return result;
}

std::string StringUtils::WideToUtf8(const SQLWCHAR* wideStr, SQLSMALLINT length) {
  if (!wideStr || length <= 0) {
    return "";
  }

  std::string result;
  result.reserve(length * 3);  // Reserve space for worst case

  for (SQLSMALLINT i = 0; i < length; ++i) {
    uint16_t wc = static_cast<uint16_t>(wideStr[i]);

    if (wc <= 0x7F) {
      // ASCII character
      result += static_cast<char>(wc);
    } else if (wc <= 0x7FF) {
      // 2-byte UTF-8
      result += static_cast<char>(0xC0 | (wc >> 6));
      result += static_cast<char>(0x80 | (wc & 0x3F));
    } else {
      // Check if this is a surrogate pair
      if (wc >= 0xD800 && wc <= 0xDBFF && i + 1 < length) {
        uint16_t nextWc = static_cast<uint16_t>(wideStr[i + 1]);
        if (nextWc >= 0xDC00 && nextWc <= 0xDFFF) {
          // Valid surrogate pair
          uint32_t codePoint = 0x10000 + (((wc - 0xD800) << 10) | (nextWc - 0xDC00));
          result += static_cast<char>(0xF0 | (codePoint >> 18));
          result += static_cast<char>(0x80 | ((codePoint >> 12) & 0x3F));
          result += static_cast<char>(0x80 | ((codePoint >> 6) & 0x3F));
          result += static_cast<char>(0x80 | (codePoint & 0x3F));
          ++i;  // Skip the next character as we've already processed it
          continue;
        }
      }

      // 3-byte UTF-8
      result += static_cast<char>(0xE0 | (wc >> 12));
      result += static_cast<char>(0x80 | ((wc >> 6) & 0x3F));
      result += static_cast<char>(0x80 | (wc & 0x3F));
    }
  }

  return result;
}

std::string StringUtils::SafeWideToUtf8ForLogging(const SQLWCHAR* wstr, size_t maxLen) {
  if (!wstr)
    return "(null)";

  // Find actual length (up to maxLen) by looking for null terminator
  size_t len = 0;
  while (len < maxLen && wstr[len] != L'\0') {
    len++;
  }

  return WideToUtf8(wstr, static_cast<SQLSMALLINT>(len));
}

std::string StringUtils::SanitizeConnectionString(const std::string& connStr) {
  // Handle empty string case
  if (connStr.empty()) {
    return "(empty connection string)";
  }

  std::string result;
  result.reserve(connStr.size());

  size_t i = 0;

  // Process the string, redacting passwords
  while (i < connStr.size()) {
    // Case-insensitive check for "pwd=" or "password="
    bool isPwdField = false;

    // Check for "PWD=" (case insensitive)
    if (i + 4 <= connStr.size()) {
      std::string pwdKey = connStr.substr(i, 4);
      for (auto& c : pwdKey)
        c = std::toupper(c);
      isPwdField = (pwdKey == "PWD=");
    }

    // Check for "Password=" (case insensitive)
    if (!isPwdField && i + 9 <= connStr.size()) {
      std::string passKey = connStr.substr(i, 9);
      for (auto& c : passKey)
        c = std::toupper(c);
      isPwdField = (passKey == "PASSWORD=");
    }

    if (isPwdField) {
      // Find the key's equals sign
      size_t equalsPos = connStr.find('=', i);
      if (equalsPos == std::string::npos) {
        // Malformed connection string - just append the rest and break
        result.append(connStr.substr(i));
        break;
      }

      // Add the key with equals sign
      result.append(connStr.substr(i, equalsPos - i + 1));
      i = equalsPos + 1;  // Move past the equals sign

      // Add asterisks instead of actual password
      result.append("********");

      // Skip until next semicolon or end of string
      while (i < connStr.size() && connStr[i] != ';') {
        i++;
      }

      // Add the semicolon if found
      if (i < connStr.size() && connStr[i] == ';') {
        result.push_back(';');
        i++;
      }
    } else {
      // Copy character as is
      result.push_back(connStr[i]);
      i++;
    }
  }

  // Log if we produced an empty result when we shouldn't have
  if (result.empty() && !connStr.empty()) {
    return "(sanitizing error - produced empty string)";
  }

  return result;
}

}  // namespace mssql