import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, FileText, TrendingUp, Users, Award, Target } from 'lucide-react';

interface Framework {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  gradient: string;
  borderColor: string;
  bgColor: string;
}

const frameworks: Framework[] = [
  {
    id: 'product-walkthrough',
    name: 'Product Walkthrough Framework',
    description: 'Ideal for step-by-step overviews of how the product works.',
    icon: <FileText className="w-5 h-5" />,
    color: 'text-blue-700',
    gradient: 'bg-gradient-to-br from-blue-500 to-blue-600',
    borderColor: 'border-blue-200',
    bgColor: 'hover:bg-blue-50'
  },
  {
    id: 'differentiation',
    name: 'Differentiation Framework',
    description: 'Highlights how this product stands out from the competition to build trust and reduce the need for comparison.',
    icon: <TrendingUp className="w-5 h-5" />,
    color: 'text-purple-700',
    gradient: 'bg-gradient-to-br from-purple-500 to-purple-600',
    borderColor: 'border-purple-200',
    bgColor: 'hover:bg-purple-50'
  },
  {
    id: 'triple-threat',
    name: 'Triple Threat Framework',
    description: 'Used to compare three or more solutions, emphasizing our value proposition while acknowledging competitor strengths.',
    icon: <Users className="w-5 h-5" />,
    color: 'text-green-700',
    gradient: 'bg-gradient-to-br from-green-500 to-green-600',
    borderColor: 'border-green-200',
    bgColor: 'hover:bg-green-50'
  },
  {
    id: 'case-study',
    name: 'Case Study Framework',
    description: 'Showcases real-world results and customer success stories to build credibility and demonstrate value.',
    icon: <Award className="w-5 h-5" />,
    color: 'text-orange-700',
    gradient: 'bg-gradient-to-br from-orange-500 to-orange-600',
    borderColor: 'border-orange-200',
    bgColor: 'hover:bg-orange-50'
  },
  {
    id: 'feature-spotlight',
    name: 'Feature Spotlight Framework',
    description: 'Deep-dives into specific features and their benefits, perfect for highlighting key capabilities.',
    icon: <Target className="w-5 h-5" />,
    color: 'text-indigo-700',
    gradient: 'bg-gradient-to-br from-indigo-500 to-indigo-600',
    borderColor: 'border-indigo-200',
    bgColor: 'hover:bg-indigo-50'
  }
];

interface FrameworkSelectorProps {
  value?: string;
  onSelect: (frameworkId: string) => void;
  disabled?: boolean;
  className?: string;
}

export const FrameworkSelector: React.FC<FrameworkSelectorProps> = ({
  value,
  onSelect,
  disabled = false,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selectedFramework = frameworks.find(f => f.id === value);

  const handleSelect = (frameworkId: string) => {
    onSelect(frameworkId);
    setIsOpen(false);
  };

  const updateDropdownPosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();
      
      const handleScroll = () => updateDropdownPosition();
      const handleResize = () => updateDropdownPosition();
      
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);
      
      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [isOpen]);

  const dropdownContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <div 
            className="fixed inset-0 z-[999998]" 
            onClick={() => setIsOpen(false)}
            style={{ zIndex: 999998 }}
          />
          
          {/* Dropdown */}
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed z-[999999] bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
            style={{ 
              zIndex: 999999,
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              maxHeight: '300px'
            }}
          >
            <div className="max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-500">
              {frameworks.map((framework, index) => (
                <motion.button
                  key={framework.id}
                  type="button"
                  onClick={() => handleSelect(framework.id)}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`
                    w-full p-4 text-left transition-all duration-200 border-b border-gray-100 last:border-b-0
                    ${framework.bgColor}
                    ${value === framework.id ? 'ring-2 ring-blue-500 ring-inset' : ''}
                  `}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${framework.gradient} text-white shadow-sm flex-shrink-0`}>
                      {framework.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`font-semibold ${framework.color}`}>{framework.name}</div>
                        {value === framework.id && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="p-1 bg-blue-500 rounded-full"
                          >
                            <Check className="w-3 h-3 text-white" />
                          </motion.div>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mt-1 leading-relaxed">
                        {framework.description}
                      </div>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <div className={`relative ${className}`}>
      {/* Selector Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full p-4 border border-gray-300 rounded-xl bg-white text-left
          transition-all duration-200 flex items-center justify-between gap-3
          ${!disabled ? 'hover:border-blue-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500' : 'opacity-50 cursor-not-allowed'}
          ${isOpen ? 'border-blue-500 shadow-md' : ''}
        `}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {selectedFramework ? (
            <>
              <div className={`p-2 rounded-lg ${selectedFramework.gradient} text-white shadow-sm flex-shrink-0`}>
                {selectedFramework.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold ${selectedFramework.color}`}>{selectedFramework.name}</div>
                <div className="text-sm text-gray-600 truncate">{selectedFramework.description}</div>
              </div>
            </>
          ) : (
            <>
              <div className="p-2 rounded-lg bg-gray-300 text-gray-600 shadow-sm flex-shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-700">Select Content Framework</div>
                <div className="text-sm text-gray-500">Choose the framework that best fits your content strategy</div>
              </div>
            </>
          )}
        </div>
        
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0"
        >
          <ChevronDown className="w-5 h-5 text-gray-400" />
        </motion.div>
      </button>

      {/* Portal for dropdown */}
      {typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
    </div>
  );
}; 