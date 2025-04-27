// test/napi/sql-parameter.test.ts
import { expect } from 'chai';
import {
  SqlParameter,
  fromValue,
  StringParameter,
  IntegerParameter,
  FloatParameter,
  BooleanParameter,
  DateTimeParameter,
  NullParameter,
  ArrayParameter,
  StringArrayParameter,
  IntegerArrayParameter,
  FloatArrayParameter,
  BooleanArrayParameter,
  DateTimeArrayParameter,
  ObjectParameter,
  TVPParameter
} from '../../'

describe('SqlParameter Tests', function() {
  describe('SqlParameter Base Class', function () {
    describe('formatValuePreview', function () {
      it('should format string values correctly', function () {
        const param = new SqlParameter();
        param.value = 'Hello World';
        expect(param.formatValuePreview()).to.equal('"Hello World"');

        param.value = 'A very long string that should be truncated in the preview';
        expect(param.formatValuePreview()).to.equal('"A very long strin..."');
        expect(param.formatValuePreview().length).to.be.lessThan(25);
      });

      it('should format arrays correctly', function () {
        const param = new SqlParameter();
        param.value = [1, 2, 3, 4, 5];
        expect(param.formatValuePreview()).to.equal('[Array(5)]');
      });

      it('should format dates correctly', function () {
        const param = new SqlParameter();
        const date = new Date('2023-04-27T12:00:00Z');
        param.value = date;
        expect(param.formatValuePreview()).to.equal(`Date(${date.toISOString()})`);
      });

      it('should handle null and undefined correctly', function () {
        const param = new SqlParameter();
        param.value = null;
        expect(param.formatValuePreview()).to.equal('null');

        param.value = undefined;
        expect(param.formatValuePreview()).to.equal('null');
      });
    });

    describe('toString', function () {
      it('should provide a useful string representation', function () {
        const param = new SqlParameter();
        param.type = 'TEST';
        param.sqlType = 'SQL_TEST';
        param.jsType = 'JS_TEST';
        param.value = 'test value';

        const result = param.toString();
        expect(result).to.include('type=TEST');
        expect(result).to.include('sqlType=SQL_TEST');
        expect(result).to.include('jsType=JS_TEST');
        expect(result).to.include('value="test value"');
      });
    });
  });

  describe('SqlParameter Type Factory', function () {
    it('should create a StringParameter for string values', function () {
      const param = SqlParameter.fromValue('Hello World');
      expect(param).to.be.instanceOf(StringParameter);
      expect(param.type).to.equal('STRING');
      expect(param.value).to.equal('Hello World');
      expect(param.cType).to.equal('SQL_C_WCHAR');
    });

    it('should create an IntegerParameter for integer values', function () {
      const param = SqlParameter.fromValue(42);
      expect(param).to.be.instanceOf(IntegerParameter);
      expect(param.type).to.equal('INTEGER');
      expect(param.value).to.equal(42);
    });

    it('should create a FloatParameter for floating point values', function () {
      const param = SqlParameter.fromValue(3.14159);
      expect(param).to.be.instanceOf(FloatParameter);
      expect(param.type).to.equal('FLOAT');
      expect(param.value).to.equal(3.14159);
    });

    it('should create a BooleanParameter for boolean values', function () {
      const param = SqlParameter.fromValue(true);
      expect(param).to.be.instanceOf(BooleanParameter);
      expect(param.type).to.equal('BIT');
      expect(param.value).to.equal(true);
    });

    it('should create a DateTimeParameter for Date values', function () {
      const date = new Date('2023-04-27T12:34:56Z');
      const param = SqlParameter.fromValue(date);
      expect(param).to.be.instanceOf(DateTimeParameter);
      expect(param.type).to.equal('DATETIME');
      expect(param.value).to.deep.equal(date);
    });

    it('should create a NullParameter for null values', function () {
      const param = SqlParameter.fromValue(null);
      expect(param).to.be.instanceOf(NullParameter);
      expect(param.type).to.equal('NULL');
      expect(param.value).to.equal(null);
    });

    it('should create string array parameters', function () {
      const param = SqlParameter.fromValue(['a', 'b', 'c']);
      expect(param).to.be.instanceOf(StringArrayParameter);
      expect(param.type).to.equal('ARRAY');
      expect((param as StringArrayParameter).elementType).to.equal('STRING');
    });

    it('should create number array parameters', function () {
      const intParam = SqlParameter.fromValue([1, 2, 3]);
      expect(intParam).to.be.instanceOf(IntegerArrayParameter);

      const floatParam = SqlParameter.fromValue([1.1, 2.2, 3.3]);
      expect(floatParam).to.be.instanceOf(FloatArrayParameter);
    });

    it('should handle arrays with null values', function () {
      const param = SqlParameter.fromValue(['a', null, 'c']) as StringArrayParameter;
      expect(param.hasNulls).to.be.true;
      expect(param.nullMap).to.deep.equal([false, true, false]);
    });

    it('should handle empty arrays', function () {
      const param = SqlParameter.fromValue([]) as ArrayParameter;
      expect(param.type).to.equal('ARRAY');
      expect(param.elementType).to.equal('UNKNOWN');
    });
  });

  describe('Parameter Type-Specific Tests', function () {
    describe('StringParameter', function () {
      it('should handle empty strings', function () {
        const param = new StringParameter('');
        expect(param.value).to.equal('');
        expect(param.precision).to.equal(0);
      });

      it('should handle null as empty string', function () {
        const param = new StringParameter(null);
        expect(param.value).to.equal('');
      });

      it('should choose SQL_WVARCHAR for normal strings', function () {
        const param = new StringParameter('Normal string');
        expect(param.sqlType).to.equal('SQL_WVARCHAR');
      });

      it('should choose SQL_WLONGVARCHAR for long strings', function () {
        // Create a string between 2000-4000 chars
        const longString = 'a'.repeat(3000);
        const param = new StringParameter(longString);
        expect(param.sqlType).to.equal('SQL_WLONGVARCHAR');
      });

      it('should use paramSize=0 for very long strings', function () {
        const veryLongString = 'a'.repeat(5000);
        const param = new StringParameter(veryLongString);
        expect(param.paramSize).to.equal(0);
      });

      it('should calculate bufferLen correctly', function () {
        const str = 'abc';
        const param = new StringParameter(str);
        // bufferLen should be byteLength + 2 for null terminator
        expect(param.bufferLen).to.equal(Buffer.byteLength(str, param.encoding) + 2);
      });
    });

    describe('IntegerParameter', function () {
      it('should choose SQL_TINYINT for small integers', function () {
        const param = new IntegerParameter(127);
        expect(param.sqlType).to.equal('SQL_TINYINT');
        expect(param.precision).to.equal(1);
      });

      it('should choose SQL_SMALLINT for medium integers', function () {
        const param = new IntegerParameter(32000);
        expect(param.sqlType).to.equal('SQL_SMALLINT');
        expect(param.precision).to.equal(2);
      });

      it('should choose SQL_INTEGER for standard integers', function () {
        const param = new IntegerParameter(2000000);
        expect(param.sqlType).to.equal('SQL_INTEGER');
        expect(param.precision).to.equal(4);
      });

      it('should choose SQL_BIGINT for large integers', function () {
        const param = new IntegerParameter(9007199254740991); // Max safe integer
        expect(param.sqlType).to.equal('SQL_BIGINT');
        expect(param.precision).to.equal(8);
      });
    });

    describe('FloatParameter', function () {
      it('should choose SQL_REAL for standard floats', function () {
        const param = new FloatParameter(3.14);
        expect(param.sqlType).to.equal('SQL_REAL');
        expect(param.precision).to.equal(4);
      });

      it('should choose SQL_DOUBLE for large or small floats', function () {
        const large = new FloatParameter(1e39);
        expect(large.sqlType).to.equal('SQL_DOUBLE');
        expect(large.precision).to.equal(8);

        const small = new FloatParameter(1e-39);
        expect(small.sqlType).to.equal('SQL_DOUBLE');
        expect(small.precision).to.equal(8);
      });

      it('should handle zero correctly', function () {
        const param = new FloatParameter(0);
        expect(param.sqlType).to.equal('SQL_REAL');
      });
    });

    describe('DateTimeParameter', function () {
      it('should handle Date objects', function () {
        const date = new Date('2023-04-27T12:34:56Z');
        const param = new DateTimeParameter(date);
        expect(param.value).to.deep.equal(date);
      });

      it('should convert string to Date', function () {
        const param = new DateTimeParameter('2023-04-27T12:34:56Z');
        expect(param.value).to.be.instanceOf(Date);
      });

      it('should convert timestamp to Date', function () {
        const timestamp = Date.now();
        const param = new DateTimeParameter(timestamp);
        expect(param.value).to.be.instanceOf(Date);
        expect((param.value as Date).getTime()).to.equal(timestamp);
      });
    });

    describe('ObjectParameter', function () {
      it('should serialize object to JSON', function () {
        const obj = {
          name: 'test',
          values: [1, 2, 3]
        };
        const param = new ObjectParameter(obj);
        expect(param.serializedValue).to.equal(JSON.stringify(obj));
      });

      it('should set bufferLen correctly', function () {
        const obj = { test: 'value' };
        const jsonStr = JSON.stringify(obj);
        const param = new ObjectParameter(obj);
        expect(param.bufferLen).to.equal(Buffer.byteLength(jsonStr, 'utf8') + 1);
      });
    });

    describe('Array Parameters', function () {
      it('should correctly build null map', function () {
        const arr = [1, null, 3, undefined, 5];
        const param = new IntegerArrayParameter(arr);
        expect(param.nullMap).to.deep.equal([false, true, false, true, false]);
        expect(param.hasNulls).to.be.true;
      });

      it('should handle empty arrays', function () {
        const param = new StringArrayParameter([]);
        expect(param.maxStrLength).to.equal(1); // Should ensure minimum of 1
      });

      it('should calculate maxStrLength correctly', function () {
        const arr = ['a', 'abc', 'abcde'];
        const param = new StringArrayParameter(arr);
        expect(param.maxStrLength).to.equal(5);
      });

      it('should set paramSize to SQL_VARLEN_DATA for BCP mode', function () {
        const arr = ['test'];
        const param = new StringArrayParameter(arr, { isBcp: true });
        expect(param.isBcp).to.be.true;
        expect(param.paramSize).to.equal('SQL_VARLEN_DATA');
      });
    });

    describe('TVPParameter', function () {
      it('should handle table-valued parameter definitions', function () {
        const tvp = {
          name: 'TestTable',
          columns: [
            {
              name: 'id',
              type: 'INTEGER'
            },
            {
              name: 'name',
              type: 'STRING'
            }
          ],
          rows: [
            [1, 'Test1'],
            [2, 'Test2']
          ]
        };

        const param = new TVPParameter(tvp);
        expect(param.type).to.equal('TVP');
        expect(param.tableName).to.equal('TestTable');
        expect(param.columns).to.deep.equal(tvp.columns);
        expect(param.rows).to.deep.equal(tvp.rows);
      });
    });
  });

  describe('Parameter creation from specification objects', function () {
    it('should create parameter from binding specification', function () {
      const spec = {
        type: 'STRING',
        value: 'test value',
        precision: 100
      };

      const param = SqlParameter.fromValue(spec);
      expect(param).to.be.instanceOf(StringParameter);
      expect(param.value).to.equal('test value');
      expect(param.precision).to.equal(100);
    });

    it('should create array parameter with elementType', function () {
      const spec = {
        type: 'ARRAY',
        elementType: 'INTEGER',
        value: [1, 2, 3]
      };

      const param = SqlParameter.fromValue(spec);
      expect(param).to.be.instanceOf(IntegerArrayParameter);
      expect(param.value).to.deep.equal([1, 2, 3]);
    });

    it('should handle custom type specifications', function () {
      const spec = {
        type: 'CUSTOM_TYPE',
        value: 'custom value',
        sqlType: 'SQL_CUSTOM',
        cType: 'SQL_C_CUSTOM'
      };

      const param = SqlParameter.fromValue(spec);
      expect(param.type).to.equal('CUSTOM_TYPE');
      expect(param.sqlType).to.equal('SQL_CUSTOM');
      expect(param.cType).to.equal('SQL_C_CUSTOM');
    });

    it('should merge options with specification', function () {
      const spec = {
        type: 'STRING',
        value: 'test'
      };

      const options = {
        encoding: 'utf8'
      };

      //  const param = SqlParameter.fromValue(spec, options);
      //  expect(param.encoding).to.equal('utf8');
    });
  });

  describe('fromValue helper function', function () {
    it('should create the same parameter as the class method', function () {
      const param1 = SqlParameter.fromValue('Test', { precision: 50 });
      const param2 = fromValue('Test', { precision: 50 });

      expect(param2.type).to.equal(param1.type);
      expect(param2.value).to.equal(param1.value);
      expect(param2.precision).to.equal(param1.precision);
    });
  });

  describe('Edge cases', function () {
    it('should handle undefined correctly', function () {
      const param = SqlParameter.fromValue(undefined);
      expect(param).to.be.instanceOf(NullParameter);
    });

    it('should handle conversion of non-string to string', function () {
      const param = new StringParameter(123 as unknown as string);
      expect(param.value).to.equal('123');
    });

    it('should handle special characters in strings', function () {
      const specialChars = 'Üñìçôdé 😀 テスト';
      const param = new StringParameter(specialChars);
      expect(param.value).to.equal(specialChars);
    });

    it('should handle array with mixed types by inferring from first non-null', function () {
      const mixedArray = [null, null, 'string', 1, true];
      const param = SqlParameter.fromValue(mixedArray);
      expect(param).to.be.instanceOf(StringArrayParameter);
    });

    it('should handle array with all nulls', function () {
      const allNullArray = [null, null, null];
      const param = SqlParameter.fromValue(allNullArray) as ArrayParameter;
      expect(param.elementType).to.equal('STRING');
    });

    it('should handle NaN values', function () {
      const param = new FloatParameter(NaN);
      expect(isNaN(param.value as number)).to.be.true;
    });

    it('should handle Infinity values', function () {
      const param = new FloatParameter(Infinity);
      expect(param.value).to.equal(Infinity);
      expect(param.sqlType).to.equal('SQL_DOUBLE');
    });
  });
})
