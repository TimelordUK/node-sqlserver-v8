// Regression tests for issue #446 - diagnostic message text.
//
// PRINT / RAISERROR text reaches JavaScript through odbcstr::swcvec2str and
// OdbcHandleImpl::read_errors. Three defects were reported and reproduced against a real
// server on ODBC Driver 17:
//
//   1. swcvec2str kept the low byte of each UTF-16 code unit, so every character above
//      U+00FF was replaced - U+017C (z with dot) narrowed to 0x7C, which is '|', and
//      U+0142 (l with stroke) to 0x42, which is 'B' - or, where the low byte was not
//      printable ASCII, dropped or turned into U+FFFD once JavaScript decoded the bytes
//      as UTF-8.
//   2. A code unit whose low byte was 0x00 - U+0100, or a genuine U+0000 - narrowed to a
//      NUL, and the string was then built from a NUL-terminated buffer, so the message
//      ended there.
//   3. read_errors sized the buffer at 10 * 1024 and ignored the length SQLGetDiagRecW
//      reports, which is the length *available* rather than the length written, so a
//      longer record arrived cut to 10239 characters with no error.
//
// These tests need neither a SQL Server nor a driver: the string conversion is pure, and
// the truncation case drives read_errors through a mocked SQLGetDiagRecW.
//
// Kept free of non-ASCII source characters so nothing here depends on which charset the
// compiler guesses for this file: the text under test is spelled with \u escapes, and the
// expectations with the UTF-8 bytes those characters must produce.
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <string>
#include <vector>

#include <common/odbc_common.h>
#include <odbc/odbc_handles.h>

#include "mock_odbc_api.h"

namespace mssql::test {
namespace {

// Lay a string out the way a driver hands one back: the text, then the terminator.
std::vector<SQLWCHAR> driver_buffer(const std::u16string& text, const size_t trailing_nuls = 1) {
  std::vector<SQLWCHAR> buffer;
  buffer.reserve(text.size() + trailing_nuls);
  for (const auto unit : text) {
    buffer.push_back(static_cast<SQLWCHAR>(unit));
  }
  buffer.insert(buffer.end(), trailing_nuls, 0);
  return buffer;
}

}  // namespace

// ---------------------------------------------------------------------------------------
// 1. Narrowing
// ---------------------------------------------------------------------------------------

TEST(DiagnosticTextTest, AsciiMessageRoundTrips) {
  const auto buffer = driver_buffer(u"Invalid object name 'dbo.missing'.");
  EXPECT_EQ(odbcstr::swcvec2str(buffer, buffer.size()), "Invalid object name 'dbo.missing'.");
}

// The line from the report - "--lista producentow uzytkownika, wydajnosciowych,
// podwladnych" with its Polish diacritics. Every one of those characters used to be
// narrowed to its low byte, so the line arrived as
// "--lista producent<U+FFFD>w u|ytkownika, wydajno[ciowych, podwBadnych".
TEST(DiagnosticTextTest, NonAsciiIsNotNarrowedToItsLowByte) {
  const auto buffer =
      driver_buffer(u"--lista producent\u00F3w u\u017Cytkownika, "
                    u"wydajno\u015Bciowych, podw\u0142adnych");
  const auto expected =
      "--lista producent\xC3\xB3"
      "w u\xC5\xBCytkownika, wydajno\xC5\x9B"
      "ciowych, podw\xC5\x82"
      "adnych";
  EXPECT_EQ(odbcstr::swcvec2str(buffer, buffer.size()), expected);
}

// The characters whose low byte is a control code - U+0105 -> 0x05, U+0107 -> 0x07 (BEL),
// U+0119 -> 0x19 - which used to vanish rather than look wrong. That is the worse half of
// the bug: a word that simply loses a letter reads as a typo in somebody's procedure
// rather than as driver damage.
TEST(DiagnosticTextTest, CharactersWithControlCodeLowBytesSurvive) {
  const auto buffer = driver_buffer(u"\u0105\u0107\u0119");
  EXPECT_EQ(odbcstr::swcvec2str(buffer, buffer.size()), "\xC4\x85\xC4\x87\xC4\x99");
}

TEST(DiagnosticTextTest, SupplementaryPlaneCharacterIsRecombined) {
  const auto buffer = driver_buffer(u"emoji \U0001F600 done");
  EXPECT_EQ(odbcstr::swcvec2str(buffer, buffer.size()), "emoji \xF0\x9F\x98\x80 done");
}

// A lone surrogate cannot be encoded. It must not corrupt or end the rest of the line.
TEST(DiagnosticTextTest, LoneSurrogateBecomesReplacementCharacter) {
  const std::vector<SQLWCHAR> buffer{u'a', 0xD800, u'b', 0};
  EXPECT_EQ(odbcstr::swcvec2str(buffer, buffer.size()),
            "a\xEF\xBF\xBD"
            "b");
}

// ---------------------------------------------------------------------------------------
// 2. NUL handling
// ---------------------------------------------------------------------------------------

// `print N'PRZED' + nchar(0x0100) + N'PO'` used to arrive as "PRZED": U+0100 narrowed to
// 0x00 and the string was then built from a NUL-terminated buffer.
TEST(DiagnosticTextTest, CodeUnitWithZeroLowByteDoesNotEndTheMessage) {
  const auto buffer = driver_buffer(u"PRZED\u0100PO");
  EXPECT_EQ(odbcstr::swcvec2str(buffer, buffer.size()), "PRZED\xC4\x80PO");
}

// Trailing NULs must go: two callers pass the *buffer* size rather than a string length
// and rely on the terminator.
TEST(DiagnosticTextTest, TrailingNulPaddingIsDropped) {
  const auto buffer = driver_buffer(u"42000");  // an SQLSTATE in its fixed six-unit buffer
  ASSERT_EQ(buffer.size(), 6u);
  EXPECT_EQ(odbcstr::swcvec2str(buffer, buffer.size()), "42000");

  const std::vector<SQLWCHAR> padded{u'4', u'2', u'0', u'0', u'0', 0, 0, 0};
  EXPECT_EQ(odbcstr::swcvec2str(padded, padded.size()), "42000");
}

// An *embedded* NUL is a legitimate character in a message and must not take the tail with
// it. Note read_errors then hands the message to OdbcError as a const char*, so a genuine
// U+0000 is still cut before it reaches JavaScript; this covers the conversion itself.
TEST(DiagnosticTextTest, EmbeddedNulKeepsTheTail) {
  const std::vector<SQLWCHAR> buffer{u'A', 0, u'B', 0};
  EXPECT_EQ(odbcstr::swcvec2str(buffer, buffer.size()), std::string("A\0B", 3));
}

TEST(DiagnosticTextTest, EmptyAndAllNulBuffers) {
  const std::vector<SQLWCHAR> empty;
  EXPECT_EQ(odbcstr::swcvec2str(empty, 0), "");

  const std::vector<SQLWCHAR> nuls{0, 0, 0};
  EXPECT_EQ(odbcstr::swcvec2str(nuls, nuls.size()), "");
}

// ---------------------------------------------------------------------------------------
// 3. Lengths that overrun the buffer
// ---------------------------------------------------------------------------------------

// SQLGetDiagRecW reports the length available, so callers can hand swcvec2str a length
// past the end of the buffer.
TEST(DiagnosticTextTest, LengthPastTheEndOfTheBufferIsClamped) {
  const auto buffer = driver_buffer(u"short");
  EXPECT_EQ(odbcstr::swcvec2str(buffer, 10 * 1024), "short");
}

// trim derived its length from capacity(), which a vector is free to make larger than
// size() - so it could read past the elements that exist.
TEST(DiagnosticTextTest, TrimClampsToSizeNotCapacity) {
  std::vector<SQLWCHAR> buffer;
  buffer.reserve(1024);
  for (const auto unit : std::u16string(u"short")) {
    buffer.push_back(static_cast<SQLWCHAR>(unit));
  }
  buffer.push_back(0);
  ASSERT_GT(buffer.capacity(), buffer.size());
  EXPECT_EQ(odbcstr::trim(buffer, 900), "short");
}

// ---------------------------------------------------------------------------------------
// 4. read_errors and the 10239-character ceiling
// ---------------------------------------------------------------------------------------

namespace {

using ::testing::_;
using ::testing::Return;

// `print cast(substring(@sql, 1, 16000) as ntext)` is the documented way around PRINT's
// own 4000/8000 limit, so a diagnostic record longer than 10240 characters is ordinary.
constexpr size_t kLongMessageChars = 16005;  // 16000 'x' plus "|END|"

std::u16string long_message() {
  return std::u16string(16000, u'x') + u"|END|";
}

// Stand in for a driver holding one record: write what fits, terminate it, and report the
// full length available the way SQLGetDiagRecW does.
SQLRETURN serve_record(const std::u16string& text,
                       SQLWCHAR* sql_state,
                       SQLINTEGER* native_error,
                       SQLWCHAR* message,
                       const SQLSMALLINT buffer_length,
                       SQLSMALLINT* text_length) {
  const std::u16string state = u"01000";
  for (size_t i = 0; i < state.size(); ++i) {
    sql_state[i] = static_cast<SQLWCHAR>(state[i]);
  }
  sql_state[state.size()] = 0;
  *native_error = 0;
  *text_length = static_cast<SQLSMALLINT>(text.size());

  if (buffer_length <= 0) {
    return SQL_SUCCESS_WITH_INFO;
  }
  const size_t writable = std::min(static_cast<size_t>(buffer_length) - 1, text.size());
  for (size_t i = 0; i < writable; ++i) {
    message[i] = static_cast<SQLWCHAR>(text[i]);
  }
  message[writable] = 0;
  return writable < text.size() ? SQL_SUCCESS_WITH_INFO : SQL_SUCCESS;
}

}  // namespace

TEST(ReadErrorsTest, ShortMessageIsReadWhole) {
  const auto api = std::make_shared<MockOdbcApi>();
  const std::u16string text = u"Changed database context to 'node'.";

  EXPECT_CALL(*api, SQLGetDiagRecW(_, _, 1, _, _, _, _, _))
      .WillOnce([&text](SQLSMALLINT,
                        SQLHANDLE,
                        SQLSMALLINT,
                        SQLWCHAR* sql_state,
                        SQLINTEGER* native_error,
                        SQLWCHAR* message,
                        SQLSMALLINT buffer_length,
                        SQLSMALLINT* text_length) {
        return serve_record(text, sql_state, native_error, message, buffer_length, text_length);
      });
  EXPECT_CALL(*api, SQLGetDiagRecW(_, _, 2, _, _, _, _, _)).WillOnce(Return(SQL_NO_DATA));
  EXPECT_CALL(*api, SQLGetDiagField(_, _, _, _, _, _, _)).WillRepeatedly(Return(SQL_SUCCESS));

  OdbcStatementHandleImpl handle;
  auto errors = std::make_shared<std::vector<std::shared_ptr<OdbcError>>>();
  handle.read_errors(api, errors);

  ASSERT_EQ(errors->size(), 1u);
  EXPECT_EQ(errors->at(0)->message, "Changed database context to 'node'.");
  EXPECT_EQ(errors->at(0)->sqlstate, "01000");
}

// The reported ceiling: 10239 characters arrived and the rest was gone with no error.
TEST(ReadErrorsTest, MessageLongerThanTheBufferIsNotTruncated) {
  const auto api = std::make_shared<MockOdbcApi>();
  const auto text = long_message();
  ASSERT_EQ(text.size(), kLongMessageChars);

  EXPECT_CALL(*api, SQLGetDiagRecW(_, _, 1, _, _, _, _, _))
      .Times(::testing::AtLeast(1))
      .WillRepeatedly([&text](SQLSMALLINT,
                              SQLHANDLE,
                              SQLSMALLINT,
                              SQLWCHAR* sql_state,
                              SQLINTEGER* native_error,
                              SQLWCHAR* message,
                              SQLSMALLINT buffer_length,
                              SQLSMALLINT* text_length) {
        return serve_record(text, sql_state, native_error, message, buffer_length, text_length);
      });
  EXPECT_CALL(*api, SQLGetDiagRecW(_, _, 2, _, _, _, _, _)).WillOnce(Return(SQL_NO_DATA));
  EXPECT_CALL(*api, SQLGetDiagField(_, _, _, _, _, _, _)).WillRepeatedly(Return(SQL_SUCCESS));

  OdbcStatementHandleImpl handle;
  auto errors = std::make_shared<std::vector<std::shared_ptr<OdbcError>>>();
  handle.read_errors(api, errors);

  ASSERT_EQ(errors->size(), 1u);
  const auto& message = errors->at(0)->message;
  EXPECT_EQ(message.size(), kLongMessageChars);
  ASSERT_GE(message.size(), 5u);
  EXPECT_EQ(message.substr(message.size() - 5), "|END|");
}

}  // namespace mssql::test
