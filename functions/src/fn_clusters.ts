import { GoogleGenerativeAI } from '@google/generative-ai';
import { Statement, StatementSchema } from 'delib-npm';
import { Response, Request, onInit } from 'firebase-functions/v1';
import { array, parse } from 'valibot';

let genAI: GoogleGenerativeAI;

onInit(() => {
    try {
        if (!process.env.GOOGLE_API_KEY) {
            throw new Error('Missing GOOGLE_API_KEY environment variable');
        }

        genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    } catch (error) {
        console.error('Error initializing GenAI', error);
    }
});

export async function getCluster(req: Request, res: Response) {
    try {

        const _descendants = req.body.descendants as Statement[];
        const topic = req.body.topic as Statement;
        if (!topic || typeof topic !== 'object') {
            throw new Error('Invalid input: topic should be a valid statement object');
        }
        if (!_descendants || !Array.isArray(_descendants)) {
            throw new Error('Invalid input: descendants should be an array of statements');
        }
        const descendants = parse(array(StatementSchema), _descendants);
        if (!descendants) {

            throw new Error('Invalid input: descendants could not be parsed');
        }
        
        const simpleDescendants = descendants.map((descendant) => ({
            statement: descendant.statement,
            statementId: descendant.statementId,
        }));
       

        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `
The following statements are ideas suggested under this topic: ${topic.statement}.

Your task:
1. Cluster these statements primarily based on their relevance and relationship to the main topic "${topic.statement}".
2. Statements that address similar aspects of the main topic should be grouped together.
3. Within each relevance-based cluster, identify and consolidate similar statements:
   - When statements express the same concept with minor variations (like "לטייל ברגל", "טיול רגלי", and "טיול רגלי"), merge them into the most appropriate version.
   - Choose the clearest and most grammatically correct version (e.g., "טיול רגלי" over variations like "לטייל ברגל" or "טיל רגלי").
   - When you integrate or merge multiple similar statements, use the statementId of the best statement (the one with the clearest expression or most grammatically correct version).
4. Name each group based on how its statements relate to the main topic, using the primary language of the statements.

Return your response as a JSON array of cluster objects with this structure:
[{
  groupName: "תיאור הקבוצה (באופן שמתייחס לנושא המרכזי)",
  statements: [
    {statement: "משפט נבחר 1", statementId: "id1"},
    {statement: "משפט נבחר 2", statementId: "id2"}
  ]
}]

The statements to analyze are: ${JSON.stringify(simpleDescendants)}
`;
        const response = await model.generateContent(prompt);
        if (!response) {
            throw new Error('Error generating response from model');
        }
        const result = response.response;
        const text = result.text();

        const groups = convertStringToJson(text);
        if (!groups || !Array.isArray(groups)) {
            throw new Error('Error parsing response: expected an array of groups');
        }

        res.status(200).send({ text, descendants, ok: true, groups });

    } catch (error) {
        res.status(500).send({ error: error instanceof Error ? error.message : 'Unknown server error', ok: false });

    }
}

interface Group {
    groupName: string;
    statements: string[];
}

function convertStringToJson(input: string): Group[] | null {
    try {
        // Check if the string starts with ```json and ends with ```
        let jsonString = input.replace(/```json/g, '');
        jsonString = jsonString.replace(/```/g, '');
        jsonString = jsonString.replace(/^>\s*/gm, '');

        const jsonArray = JSON.parse(jsonString);

        // Parse the cleaned JSON string into an object
        return jsonArray as Group[];
    } catch (error) {
        // Handle any parsing errors
        console.error('Error parsing JSON string:', error);
        throw new Error('Invalid JSON string provided');
        // Return an empty array in case of error
    }
}