import Link from "next/link";

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10 sm:px-10 sm:py-14 flex items-center justify-center">
      <div className="card w-full max-w-lg p-8 text-center animate-fade-in">
        <h1 className="text-2xl font-semibold text-gray-900">Forgot password</h1>
        <p className="mt-2 text-sm text-gray-600">
          Password reset is currently handled by your administrator. Contact your Builder Pro admin for assistance.
        </p>

        <div className="mt-6 flex items-center justify-center gap-5 text-sm">
          <Link href="/signin" className="font-medium text-orange-600 hover:text-orange-700">
            Back to Sign In
          </Link>
          <Link href="/" className="text-gray-600 hover:text-gray-900">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
