import type { Metadata } from "next";
import Link from "next/link";
import { DevUserPicker } from "@/components/DevUserPicker";
import "./globals.css";

export const metadata: Metadata = {
  title: "SparkyTalk",
  description: "AI 派工与进度管理",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="topbar">
          <strong>SparkyTalk</strong>
          <nav>
            <Link href="/">今日看板</Link>
            <Link href="/sites">工地</Link>
          </nav>
          <DevUserPicker />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
