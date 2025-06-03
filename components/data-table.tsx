"use client"

import { useMemo } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface DataTableProps {
  data: any[]
}

export function DataTable({ data }: DataTableProps) {
  const columns = useMemo(() => {
    if (data.length === 0) return []

    const firstRow = data[0]
    return Object.keys(firstRow)
      .filter((key) => !["id", "timestamp"].includes(key) && typeof firstRow[key] !== "object")
      .slice(0, 10) // Show first 10 columns
  }, [data])

  const formatValue = (value: any) => {
    if (typeof value === "number") {
      return value.toFixed(2)
    }
    return String(value || "")
  }

  if (data.length === 0) {
    return <div className="text-center text-gray-400 py-8">No data available</div>
  }

  return (
    <div className="max-h-96 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-gray-700">
            <TableHead className="text-gray-300">Time</TableHead>
            {columns.map((column) => (
              <TableHead key={column} className="text-gray-300">
                {column.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase())}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, index) => (
            <TableRow key={index} className="border-gray-700 hover:bg-gray-800">
              <TableCell className="text-gray-300">{row.timestamp?.toLocaleTimeString() || index}</TableCell>
              {columns.map((column) => (
                <TableCell key={column} className="text-gray-300">
                  {formatValue(row[column])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
