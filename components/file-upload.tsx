"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Upload, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import Papa from "papaparse"

interface FileUploadProps {
  onFileUpload: (data: any[]) => void
  isLoading: boolean
}

export function FileUpload({ onFileUpload, isLoading }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false)

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (file && file.type === "text/csv") {
        Papa.parse(file, {
          complete: (results) => {
            onFileUpload(results.data)
          },
          header: true,
          skipEmptyLines: true,
        })
      }
    },
    [onFileUpload],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
    },
    multiple: false,
  })

  const loadSampleData = async () => {
    try {
      const response = await fetch("/sample-data.csv")
      const csvText = await response.text()

      Papa.parse(csvText, {
        complete: (results) => {
          onFileUpload(results.data)
        },
        header: true,
        skipEmptyLines: true,
      })
    } catch (error) {
      console.error("Error loading sample data:", error)
    }
  }

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive || dragActive ? "border-blue-500 bg-blue-500/10" : "border-gray-600 hover:border-gray-500"
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center space-y-4">
          {isLoading ? (
            <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
          ) : (
            <Upload className="h-12 w-12 text-gray-400" />
          )}
          <div>
            <p className="text-lg font-medium text-white">
              {isLoading ? "Processing file..." : "Drop your CSV file here"}
            </p>
            <p className="text-gray-400">
              {isLoading ? "Please wait while we process your data" : "or click to browse files"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center">
        <div className="flex items-center space-x-2 text-gray-400">
          <div className="h-px bg-gray-600 flex-1"></div>
          <span className="text-sm">or</span>
          <div className="h-px bg-gray-600 flex-1"></div>
        </div>
      </div>

      <Button
        onClick={loadSampleData}
        variant="outline"
        className="w-full border-gray-600 text-white hover:bg-gray-700"
        disabled={isLoading}
      >
        <FileText className="h-4 w-4 mr-2" />
        Load Sample Data
      </Button>
    </div>
  )
}
