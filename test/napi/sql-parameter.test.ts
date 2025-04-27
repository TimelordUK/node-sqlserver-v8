// test/napi/sql-parameter.test.ts
import { expect } from 'chai';
import { SqlParameter, fromValue } from '../../src/sql-parameter';

describe('SqlParameter', function() {
    it('should create a parameter with string type for string values', function() {
      const param = SqlParameter.fromValue('Hello World', { length: 100 });
      expect(param.type).to.equal('NVARCHAR');
      expect(param.value).to.equal('Hello World');
      expect(param.options.length).to.equal(100);
    });

    it('should create a parameter with INT type for integer values', function() {
      const param = SqlParameter.fromValue(42);
      expect(param.type).to.equal('INT');
      expect(param.value).to.equal(42);
    });

    it('should create a parameter with FLOAT type for floating point values', function() {
      const param = SqlParameter.fromValue(3.14159);
      expect(param.type).to.equal('FLOAT');
      expect(param.value).to.equal(3.14159);
    });

    it('should create a parameter with BIT type for boolean values', function() {
      const param = SqlParameter.fromValue(true);
      expect(param.type).to.equal('BIT');
      expect(param.value).to.equal(true);
    });

    it('should create a parameter with DATETIME type for Date values', function() {
      const date = new Date('2023-04-27T12:34:56Z');
      const param = SqlParameter.fromValue(date);
      expect(param.type).to.equal('DATETIME');
      expect(param.value).to.equal(date);
    });

    it('should create a parameter with NULL type for null values', function() {
      const param = SqlParameter.fromValue(null);
      expect(param.type).to.equal('NULL');
      expect(param.value).to.equal(null);
    });
  });

  describe('fromValue helper function', function() {
    it('should create the same parameter as the class method', function() {
      const param1 = SqlParameter.fromValue('Test', { length: 50 });
      const param2 = fromValue('Test', { length: 50 });
      
      expect(param2.type).to.equal(param1.type);
      expect(param2.value).to.equal(param1.value);
      expect(param2.options.length).to.equal(param1.options.length);
    });
});