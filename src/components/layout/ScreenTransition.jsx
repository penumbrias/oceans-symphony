import { motion } from 'framer-motion';

export default function ScreenTransition({ children, isForward = true }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: isForward ? 100 : -100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: isForward ? -100 : 100 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  );
}