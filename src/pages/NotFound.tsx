import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Bento, Label, Money } from "@/components/deep-space/primitives";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] p-6">
      <Bento className="p-8 text-center max-w-sm">
        <Money size="xl" className="block mb-2">404</Money>
        <Label className="mb-4 block">Stránka neexistuje</Label>
        <p className="text-sm text-white/40 mb-6">{location.pathname}</p>
        <Link to="/" className="text-[#14F195] text-sm font-semibold hover:underline">
          Späť na domov
        </Link>
      </Bento>
    </div>
  );
};

export default NotFound;
