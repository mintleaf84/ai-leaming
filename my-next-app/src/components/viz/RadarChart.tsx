"use client";

import React, { useEffect, useRef } from 'react';
import { select } from 'd3-selection';
import { scaleLinear } from 'd3-scale';
import { lineRadial, curveLinearClosed } from 'd3-shape';

export interface RadarData {
  axis: string;
  value: number;
}

export interface RadarChartProps {
  data: RadarData[];
}

export default function RadarChart({ data }: RadarChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!data || !svgRef.current) return;

    const width = 300;
    const height = 300;
    const margin = 40;
    const radius = Math.min(width, height) / 2 - margin;
    
    // Clear
    select(svgRef.current).selectAll("*").remove();

    const svg = select(svgRef.current)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${width/2},${height/2})`);

    const axes = data.map(d => d.axis);
    const angleSlice = (Math.PI * 2) / axes.length;

    // Scale
    const rScale = scaleLinear().range([0, radius]).domain([0, 100]);

    // Draw Axes
    const axisGrid = svg.append("g").attr("class", "axisWrapper");
    
    // Levels (circles)
    const levels = 5;
    for(let j=0; j<levels; j++){
      const levelFactor = radius * ((j+1)/levels);
      axisGrid.selectAll(".levels")
        .data([1]) // Dummy data
        .enter()
        .append("circle")
        .attr("r", levelFactor)
        .style("fill", "#CDCDCD")
        .style("stroke", "#CDCDCD")
        .style("fill-opacity", 0.1);
    }

    // Axis Lines
    const axis = axisGrid.selectAll(".axis")
      .data(axes)
      .enter()
      .append("g")
      .attr("class", "axis");

    axis.append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", (d, i) => rScale(100) * Math.cos(angleSlice * i - Math.PI/2))
      .attr("y2", (d, i) => rScale(100) * Math.sin(angleSlice * i - Math.PI/2))
      .attr("class", "line")
      .style("stroke", "white")
      .style("stroke-width", "2px");

    axis.append("text")
      .attr("class", "legend")
      .style("font-size", "11px")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("x", (d, i) => rScale(110) * Math.cos(angleSlice * i - Math.PI/2))
      .attr("y", (d, i) => rScale(110) * Math.sin(angleSlice * i - Math.PI/2))
      .text(d => d);

    // Draw The Area
    const radarLine = lineRadial<RadarData>()
      .curve(curveLinearClosed)
      .radius(d => rScale(d.value))
      .angle((d, i) => i * angleSlice);

    svg.append("path")
      .datum(data)
      .attr("d", radarLine)
      .style("stroke-width", 2)
      .style("stroke", "#22c55e")
      .style("fill", "#22c55e")
      .style("fill-opacity", 0.5);

    // Draw Circles
    svg.selectAll(".radarCircle")
        .data(data)
        .enter().append("circle")
        .attr("class", "radarCircle")
        .attr("r", 4)
        .attr("cx", (d, i) => rScale(d.value) * Math.cos(angleSlice * i - Math.PI/2))
        .attr("cy", (d, i) => rScale(d.value) * Math.sin(angleSlice * i - Math.PI/2))
        .style("fill", "#22c55e")
        .style("fill-opacity", 0.8);

  }, [data]);

  return <svg ref={svgRef} />;
}
