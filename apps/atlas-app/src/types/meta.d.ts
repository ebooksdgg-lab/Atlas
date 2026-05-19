// Facebook SDK global types for WhatsApp Embedded Signup

interface FBAuthResponse {
  code?: string
  accessToken?: string
  userID?: string
  expiresIn?: number
  phone_number_id?: string
  waba_id?: string
}

interface FBLoginResponse {
  authResponse: FBAuthResponse | null
  status: "connected" | "not_authorized" | "unknown"
}

interface FBLoginOptions {
  config_id?: string
  response_type?: string
  override_default_response_type?: boolean
  scope?: string
  extras?: {
    feature?: string
    setup?: Record<string, unknown>
    sessionInfoVersion?: string
    featureType?: string
  }
}

interface FBSDKInstance {
  init(options: {
    appId: string
    autoLogAppEvents?: boolean
    xfbml?: boolean
    version: string
  }): void
  login(callback: (response: FBLoginResponse) => void, options?: FBLoginOptions): void
}

declare global {
  interface Window {
    fbAsyncInit?: () => void
    FB: FBSDKInstance
  }
}

export {}
