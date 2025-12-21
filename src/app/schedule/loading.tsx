export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600 text-lg">載入中...</p>
        <p className="text-gray-500 text-sm mt-2">正在載入你的時程表</p>
      </div>
    </div>
  );
}

