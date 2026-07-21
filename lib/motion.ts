/** Shared motion / transition tokens for jump-free DCA UI updates. */
export const SMOOTH_WIDTH_MS = 700;
export const SMOOTH_COLOR_MS = 500;

export const smoothWidthClass = "transition-all duration-700 ease-in-out";
export const smoothColorClass = "transition-colors duration-500 ease-in-out";

export const smoothWidthTransition = {
  duration: SMOOTH_WIDTH_MS / 1000,
  ease: [0.4, 0, 0.2, 1] as const,
};

export const smoothColorTransition = {
  duration: SMOOTH_COLOR_MS / 1000,
  ease: "easeInOut" as const,
};

export const pageTransition = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.3, ease: "easeOut" as const },
};

export const listContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.04,
    },
  },
};

export const listItemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
};

export const springTransition = {
  type: "spring" as const,
  stiffness: 400,
  damping: 28,
};

export const interactiveCard = {
  whileHover: {
    scale: 1.01,
    boxShadow: "0 0 28px rgba(52, 211, 153, 0.1)",
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  whileTap: { scale: 0.98 },
  transition: springTransition,
};

export const interactiveButton = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.97 },
  transition: springTransition,
};

export const interactiveRow = {
  whileHover: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    scale: 1.005,
  },
  whileTap: { scale: 0.995 },
  transition: springTransition,
};
