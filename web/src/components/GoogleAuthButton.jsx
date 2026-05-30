import { GoogleLogin } from '@react-oauth/google'

export default function GoogleAuthButton({ onSuccess, onError, loading }) {
  return (
    <>
      <div className="auth-divider">
        <span className="auth-divider-line" />
        <span className="auth-divider-text">OR</span>
        <span className="auth-divider-line" />
      </div>
      <div className="auth-google-wrap">
        <GoogleLogin
          onSuccess={(r) => onSuccess(r.credential)}
          onError={onError}
          theme="filled_black"
          size="large"
          text="signin_with"
          shape="rectangular"
          width="360"
        />
      </div>
    </>
  )
}
