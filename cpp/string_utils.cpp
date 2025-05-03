#include "platform.h"
#include "string_utils.h"
#include <Logger.h>
#include <stdexcept>

namespace mssql
{

  bool StringUtils::IsUtf8ContinuationByte(unsigned char byte)
  {
    return (byte & 0xC0) == 0x80;
  }

  int StringUtils::GetUtf8SequenceLength(unsigned char firstByte)
  {
    if ((firstByte & 0x80) == 0)
      return 1;
    if ((firstByte & 0xE0) == 0xC0)
      return 2;
    if ((firstByte & 0xF0) == 0xE0)
      return 3;
    if ((firstByte & 0xF8) == 0xF0)
      return 4;
    return 0; // Invalid sequence
  }

  uint32_t StringUtils::DecodeUtf8Sequence(const char *sequence, int length)
  {
    uint32_t codePoint;

    switch (length)
    {
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

  void StringUtils::EncodeUtf16(uint32_t codePoint, std::vector<uint16_t> &output)
  {
    if (codePoint <= 0xFFFF)
    {
      output.push_back(static_cast<uint16_t>(codePoint));
    }
    else if (codePoint <= 0x10FFFF)
    {
      codePoint -= 0x10000;
      output.push_back(static_cast<uint16_t>(0xD800 + (codePoint >> 10)));
      output.push_back(static_cast<uint16_t>(0xDC00 + (codePoint & 0x3FF)));
    }
    else
    {
      throw std::runtime_error("Invalid Unicode code point");
    }
  }

  std::shared_ptr<std::vector<uint16_t>> StringUtils::Utf8ToUtf16(const std::string &utf8Str)
  {
    auto result = std::make_shared<std::vector<uint16_t>>();
    const char *str = utf8Str.c_str();
    size_t len = utf8Str.length();
    size_t i = 0;

    while (i < len)
    {
      int seqLen = GetUtf8SequenceLength(str[i]);
      if (seqLen == 0 || i + seqLen > len)
      {
        throw std::runtime_error("Invalid UTF-8 sequence");
      }

      uint32_t codePoint = DecodeUtf8Sequence(str + i, seqLen);
      EncodeUtf16(codePoint, *result);
      i += seqLen;
    }

    return result;
  }

  std::string StringUtils::WideToUtf8(const SQLWCHAR *wideStr, SQLSMALLINT length)
  {
    if (!wideStr || length <= 0)
    {
      return "";
    }

    std::string result;
    result.reserve(length * 3); // Reserve space for worst case

    for (SQLSMALLINT i = 0; i < length; ++i)
    {
      uint16_t wc = static_cast<uint16_t>(wideStr[i]);

      if (wc <= 0x7F)
      {
        // ASCII character
        result += static_cast<char>(wc);
      }
      else if (wc <= 0x7FF)
      {
        // 2-byte UTF-8
        result += static_cast<char>(0xC0 | (wc >> 6));
        result += static_cast<char>(0x80 | (wc & 0x3F));
      }
      else
      {
        // Check if this is a surrogate pair
        if (wc >= 0xD800 && wc <= 0xDBFF && i + 1 < length)
        {
          uint16_t nextWc = static_cast<uint16_t>(wideStr[i + 1]);
          if (nextWc >= 0xDC00 && nextWc <= 0xDFFF)
          {
            // Valid surrogate pair
            uint32_t codePoint = 0x10000 + (((wc - 0xD800) << 10) | (nextWc - 0xDC00));
            result += static_cast<char>(0xF0 | (codePoint >> 18));
            result += static_cast<char>(0x80 | ((codePoint >> 12) & 0x3F));
            result += static_cast<char>(0x80 | ((codePoint >> 6) & 0x3F));
            result += static_cast<char>(0x80 | (codePoint & 0x3F));
            ++i; // Skip the next character as we've already processed it
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

} // namespace mssql