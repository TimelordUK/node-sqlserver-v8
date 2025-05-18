import { NativeModule } from './native-module'
import { Connection } from './connection'

export interface BcpOptions {
  tableName: string
  columns?: string[]
}

export interface BcpColumnBinding {
  columnNumber: number
  data: any[]
  indicators: number[]
  sqlType: number
  bufferLength: number
}

export interface BcpResult {
  success: boolean
  message: string
}

export class Bcp {
  private nativeBcp: any
  
  constructor(private connection: Connection) {
    const nativeConnection = (connection as any)._native
    if (!nativeConnection) {
      throw new Error('Connection not open')
    }
    
    this.nativeBcp = nativeConnection.createBcp()
  }
  
  async init(options: BcpOptions): Promise<boolean> {
    if (!this.nativeBcp) {
      throw new Error('BCP not initialized')
    }
    
    return this.nativeBcp.init(options.tableName, options.columns || [])
  }
  
  async bindColumn(binding: BcpColumnBinding): Promise<boolean> {
    if (!this.nativeBcp) {
      throw new Error('BCP not initialized')
    }
    
    return this.nativeBcp.bindColumn(
      binding.columnNumber,
      { values: binding.data },  // Wrapped as parameter object
      binding.indicators,
      binding.sqlType,
      binding.bufferLength
    )
  }
  
  async execute(): Promise<BcpResult> {
    if (!this.nativeBcp) {
      throw new Error('BCP not initialized')
    }
    
    return this.nativeBcp.execute()
  }
  
  getRowCount(): number {
    if (!this.nativeBcp) {
      throw new Error('BCP not initialized')
    }
    
    return this.nativeBcp.getRowCount()
  }
}

// Add the createBcp method to Connection class
declare module './connection' {
  interface Connection {
    createBcp(): Bcp
  }
}

// Add the createBcp method to Connection prototype
Connection.prototype.createBcp = function(this: Connection): Bcp {
  return new Bcp(this)
}