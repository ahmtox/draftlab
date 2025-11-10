export function HeaderBar() {
  return (
    <header className="fixed top-0 left-0 right-0 h-12 bg-white/95 backdrop-blur-sm text-gray-800 flex items-center px-6 z-50 border-b border-gray-200 shadow-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-sky-600">DraftLab</h1>
        <span className="text-gray-300">|</span>
        <span className="text-sm text-gray-600">Untitled Project</span>
      </div>
    </header>
  );
}