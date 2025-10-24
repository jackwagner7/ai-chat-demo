// import type { NextConfig } from "next";

// const nextConfig: NextConfig = {
//   /* config options here */
// };

// export default nextConfig;
// /** @type {import('next').NextConfig} */
// const nextConfig = {
//   reactStrictMode: false,   // 👈 add this line
// };

// module.exports = nextConfig;
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {}, // 👈 tells Next you’re okay with Turbopack
};

module.exports = nextConfig;
