import React from 'react'
import { useRandomSuggestions } from './RandomSuggestionsVM'

const RandomSuggestions = () => {
	const { randomSuggestions } = useRandomSuggestions()

	console.log(randomSuggestions)

	return (
		<div>RandomSuggestions</div>
	)
}

export default RandomSuggestions