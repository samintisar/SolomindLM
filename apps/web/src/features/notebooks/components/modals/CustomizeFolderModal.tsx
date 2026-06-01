import {
  BarChart3,
  Book,
  Brain,
  FileText,
  Folder,
  Globe,
  GraduationCap,
  Lightbulb,
  Monitor,
  Palette,
  Search,
  Settings2,
  Type,
  X,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { FolderItem } from "@/shared/types/index";

const IconMap: Record<string, React.FC<any>> = {
  Folder,
  Book,
  BarChart: BarChart3,
  Monitor,
  Search,
  Brain,
  Globe,
  FileText,
  GraduationCap,
  Lightbulb,
};

const COVER_COLORS = [
  "bg-vintage-brown-300",
  "bg-vintage-red-300",
  "bg-vintage-orange-300",
  "bg-vintage-amber-300",
  "bg-vintage-amber-400",
  "bg-vintage-green-300",
  "bg-vintage-green-400",
  "bg-vintage-blue-300",
  "bg-vintage-blue-400",
  "bg-vintage-blue-500",
  "bg-vintage-brown-400",
  "bg-vintage-red-400",
  "bg-vintage-orange-400",
  "bg-vintage-amber-500",
  "bg-vintage-green-500",
  "bg-vintage-blue-200",
  "bg-vintage-red-200",
  "bg-vintage-orange-200",
];

const AVAILABLE_ICONS = [
  "Folder",
  "Book",
  "BarChart",
  "Monitor",
  "Search",
  "Brain",
  "Globe",
  "FileText",
  "GraduationCap",
  "Lightbulb",
];

interface CustomizeFolderModalProps {
  folder?: FolderItem;
  onClose: () => void;
  onSave: (data: { name: string; color: string; icon: string }) => void;
}

export const CustomizeFolderModal: React.FC<CustomizeFolderModalProps> = ({
  folder,
  onClose,
  onSave,
}) => {
  const isCreateMode = !folder;
  const [name, setName] = useState(folder?.name || "");
  const [selectedColor, setSelectedColor] = useState(folder?.color || "bg-vintage-brown-300");
  const [selectedIcon, setSelectedIcon] = useState(folder?.icon || "Folder");

  // Update state when folder prop changes (when data is updated in parent)
  useEffect(() => {
    if (folder) {
      setName(folder.name);
      setSelectedColor(folder.color || "bg-vintage-brown-300");
      setSelectedIcon(folder.icon || "Folder");
    }
  }, [folder?.id]); // Only update when folder ID changes (different folder selected)

  const CurrentIcon = IconMap[selectedIcon] || Folder;

  const handleSave = () => {
    onSave({ name: name.trim(), color: selectedColor, icon: selectedIcon });
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-bold font-sans">
            {isCreateMode ? "Create folder" : "Customize folder"}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-xl transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Preview */}
        <div className="p-6 flex justify-center bg-secondary/10">
          <div className="w-48 aspect-16/10 rounded-xl bg-card border border-border shadow-md flex flex-col ring-1 ring-border/50 overflow-hidden">
            <div
              className={`h-[55%] ${selectedColor} bg-opacity-25 flex items-center justify-center`}
            >
              <CurrentIcon className={`w-10 h-10 ${selectedColor.replace("bg-", "text-")}`} />
            </div>
            <div className="h-[45%] p-3 bg-card">
              <div className="h-2 w-2/3 bg-muted rounded-full mb-2" />
              <div className="h-2 w-1/3 bg-muted/50 rounded-full" />
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="p-6 space-y-5">
          {/* Name Input */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Type className="w-3.5 h-3.5" /> Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Folder name"
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-serif"
              autoFocus
            />
          </div>

          {/* Color Picker */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Palette className="w-3.5 h-3.5" /> Color
            </label>
            <div className="grid grid-cols-9 gap-2">
              {COVER_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`w-6 h-6 rounded-xl ${color} ring-2 ring-offset-2 ring-offset-card transition-all hover:scale-110 ${selectedColor === color ? "ring-primary" : "ring-transparent"}`}
                />
              ))}
            </div>
          </div>

          {/* Icon Picker */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Settings2 className="w-3.5 h-3.5 shrink-0" /> Icon
            </label>
            <div className="grid grid-cols-5 gap-3">
              {AVAILABLE_ICONS.map((iconName) => {
                const Icon = IconMap[iconName] || Folder;
                const isSelected = selectedIcon === iconName;
                return (
                  <button
                    key={iconName}
                    onClick={() => setSelectedIcon(iconName)}
                    className={`flex items-center justify-center p-2 rounded-lg border transition-all ${isSelected ? "bg-primary/10 border-primary text-primary" : "bg-secondary/30 border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                  >
                    <Icon className="w-5 h-5" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-secondary/10 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-6 py-2 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreateMode ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};
