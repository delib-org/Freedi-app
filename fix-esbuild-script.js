// fix-esbuild.js
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// Path to the project root
const projectRoot = process.cwd();

try {
	console.log('Starting esbuild fix script...');

	// First, try to remove esbuild completely
	try {
		console.log('Attempting to remove esbuild...');
		execSync('npm uninstall esbuild', { stdio: 'inherit' });
	} catch (error) {
		console.log('Could not uninstall esbuild, continuing with fix...');
	}

	// Try to clean npm cache
	try {
		console.log('Cleaning npm cache...');
		execSync('npm cache clean --force', { stdio: 'inherit' });
	} catch (error) {
		console.log('Could not clean npm cache, continuing...');
	}

	// Install the specific version we need
	try {
		console.log('Installing esbuild 0.25.2...');
		execSync('npm install esbuild@0.25.2 --save-exact', { stdio: 'inherit' });
	} catch (error) {
		console.log('Error installing esbuild 0.25.2, attempting manual fix...');

		// Try to fix the esbuild package.json directly
		const esbuildPath = join(projectRoot, 'node_modules', 'esbuild');
		if (existsSync(esbuildPath)) {
			const packageJsonPath = join(esbuildPath, 'package.json');

			if (existsSync(packageJsonPath)) {
				console.log('Modifying esbuild package.json...');
				const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
				packageJson.version = '0.25.2';
				writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
				console.log('Successfully updated esbuild package.json version to 0.25.2');
			} else {
				console.log('esbuild package.json not found');
			}
		} else {
			console.log('esbuild directory not found');
		}
	}

	console.log('Fix script completed. Try running your app now.');
} catch (error) {
	console.error('Error in fix script:', error);
}
