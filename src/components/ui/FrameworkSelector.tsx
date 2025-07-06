import React, { useState } from 'react';
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
    borderColor: 'border-blue-200 hover:border-blue-300',
    bgColor: 'bg-blue-50 hover:bg-blue-100'
  },
  {
    id: 'differentiation',
    name: 'Differentiation Framework',
    description: 'Highlights how this product stands out from the competition to build trust and reduce the need for comparison.',
    icon: <TrendingUp className="w-5 h-5" />,
    color: 'text-purple-700',
    gradient: 'bg-gradient-to-br from-purple-500 to-purple-600',
    borderColor: 'border-purple-200 hover:border-purple-300',
    bgColor: 'bg-purple-50 hover:bg-purple-100'
  },
  {
    id: 'triple-threat',
    name: 'Triple Threat Framework',
    description: 'Used to compare three or more solutions, emphasizing our value proposition while acknowledging competitor strengths.',
    icon: <Users className="w-5 h-5" />,
    color: 'text-green-700',
    gradient: 'bg-gradient-to-br from-green-500 to-green-600',
    borderColor: 'border-green-200 hover:border-green-300',
    bgColor: 'bg-green-50 hover:bg-green-100'
  },
  {
    id: 'case-study',
    name: 'Case Study Framework',
    description: 'Builds credibility by showcasing real-world results and testimonials from existing customers.',
    icon: <Award className="w-5 h-5" />,
    color: 'text-amber-700',
    gradient: 'bg-gradient-to-br from-amber-500 to-amber-600',
    borderColor: 'border-amber-200 hover:border-amber-300',
    bgColor: 'bg-amber-50 hover:bg-amber-100'
  },
  {
    id: 'benefit',
    name: 'Benefit Framework',
    description: 'Focuses on the core benefits of the product based on common user pain points and goals.',
    icon: <Target className="w-5 h-5" />,
    color: 'text-red-700',
    gradient: 'bg-gradient-to-br from-red-500 to-red-600',
    borderColor: 'border-red-200 hover:border-red-300',
    bgColor: 'bg-red-50 hover:bg-red-100'
  }
];

interface FrameworkSelectorProps {
  value?: string;
  onSelect: (frameworkId: string) => void;
  disabled?: boolean;
  className?: string;
}

export function FrameworkSelector({ value, onSelect, disabled = false, className = '' }: FrameworkSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedFramework = frameworks.find(f => f.id === value);

  const handleSelect = (frameworkId: string) => {
    onSelect(frameworkId);
    setIsOpen(false);
  };

  return (
    <>
      {/* Main Container */}
      <div className={`relative ${className}`} style={{ zIndex: 1 }}>
        {/* Dropdown Button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className={`
            w-full p-4 rounded-xl border-2 transition-all duration-300 text-left
            ${disabled 
              ? 'bg-gray-100 border-gray-200 cursor-not-allowed opacity-60' 
              : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-lg cursor-pointer'
            }
            ${isOpen ? 'border-blue-400 shadow-lg' : ''}
          `}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {selectedFramework ? (
                <>
                  <div className={`p-2 rounded-lg ${selectedFramework.gradient} text-white shadow-sm`}>
                    {selectedFramework.icon}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{selectedFramework.name}</div>
                    <div className="text-sm text-gray-500 mt-1">{selectedFramework.description}</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-2 rounded-lg bg-gray-200 text-gray-500">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-700">Select Content Framework</div>
                    <div className="text-sm text-gray-500 mt-1">Choose the framework that best fits your content strategy</div>
                  </div>
                </>
              )}
            </div>
            <motion.div
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ duration: 0.3 }}
            >
              <ChevronDown className="w-5 h-5 text-gray-400" />
            </motion.div>
          </div>
        </button>

        {/* Dropdown Menu */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute z-[99999] w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
              style={{ 
                zIndex: 99999,
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0
              }}
            >
              <div className="max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
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
          )}
        </AnimatePresence>
      </div>

      {/* Overlay to close dropdown - positioned outside main container */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-[99998]" 
          onClick={() => setIsOpen(false)}
          style={{ zIndex: 99998 }}
        />
      )}
    </>
  );
} 