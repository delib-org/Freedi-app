import useClickOutside from "@/controllers/hooks/useClickOutside";
import {  useRef, useState } from "react";

const Dropdown = () => {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef(null);
	
	useClickOutside(dropdownRef, () => {
	  setIsOpen(false);
	});
  
	return (
	  <div ref={dropdownRef}>
		<button onClick={() => setIsOpen(!isOpen)}>Toggle Dropdown</button>
		{isOpen && (
		  <div style={{ border: "1px solid #000", padding: "10px" }}>
			<p>Dropdown Content</p>
		  </div>
		)}
	  </div>
	);
  };
export default Dropdown;