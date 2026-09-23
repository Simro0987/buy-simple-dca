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
    y: -2,
    boxShadow: "0 0 28px rgba(0, 255, 163, 0.12)",
    borderColor: "rgba(0, 255, 163, 0.28)",
  },
  whileTap: { scale: 0.99 },
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
