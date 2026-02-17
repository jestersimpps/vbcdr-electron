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
