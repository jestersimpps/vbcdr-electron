export interface ApiResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

export interface TabInfo {
  id: string
  url: string
  title: string
}

export interface NavigateRequest {
  tabId: string
  url: string
}

export interface ClickRequest {
  tabId: string
  selector: string
}

export interface TypeRequest {
  tabId: string
  selector: string
  text: string
  clear?: boolean
}

export interface ExecuteJsRequest {
  tabId: string
  script: string
}

export interface TabIdRequest {
  tabId: string
}

export interface WaitForSelectorRequest {
  tabId: string
  selector: string
  timeout?: number
}

export interface TextRequest {
  tabId: string
  selector?: string
}

export interface ScrollRequest {
  tabId: string
  direction?: 'up' | 'down' | 'top' | 'bottom'
  amount?: number
}

export interface QuerySelectorRequest {
  tabId: string
  selector: string
  attributes?: string[]
  all?: boolean
}
