export default function BrandLogo({ size = 44 }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 shadow-lg shadow-teal-950/20"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 32 32" fill="none" className="h-7 w-7">
        <path
          d="M9 4.75h9l5 5v17.5H9a2 2 0 0 1-2-2v-18a2.5 2.5 0 0 1 2-2.5Z"
          stroke="white"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M18 5v5h5M11.5 15h9M11.5 19h9" stroke="white" strokeWidth="1.8" />
        <path
          d="m12 23 2.1 2.1 4-4.1"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
