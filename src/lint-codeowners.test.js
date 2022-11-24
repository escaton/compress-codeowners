// @ts-check
const fs = require('fs')
const codeowners = require('./lint-codeowners')

describe('Lint codeowners', () => {
	/**
	 * @param {(path: string) => boolean} fn
	 */
	const mockIsDir = fn =>
		jest.spyOn(fs, 'lstatSync').mockImplementation(arg => {
			const result = fn(arg.toString())
			return /** @type {fs.Stats} */ ({
				isDirectory: () => result,
			})
		})

	beforeEach(() => {
		jest.resetModules()
	})

	/**
	 * @param {string} msg
	 */
	const fail = msg =>
		expect.objectContaining({
			message: expect.stringContaining(msg),
		})

	it.each`
		path                   | pattern
		${'/foo.js'}           | ${'foo.js'}
		${'/foo.js'}           | ${'*.js'}
		${'/config/foo.js'}    | ${'*.js'}
		${'/config/foo.js'}    | ${'foo.js'}
		${'/config/foo.js'}    | ${'*foo*'}
		${'/config/foobar.js'} | ${'*foo*'}
		${'/config/barfoo.js'} | ${'*foo*'}
		${'/config/foo.js'}    | ${'foo*.js'}
		${'/config/foo.js'}    | ${'/config/*.js'}
	`('should match path "$path" with pattern "$pattern"', ({path, pattern}) => {
		expect(codeowners.match([path], pattern)).toEqual([path])
	})

	it.each`
		path                | pattern
		${'/foo.js'}        | ${'*.ts'}
		${'/config/foo.js'} | ${'*.ts'}
		${'/config/foo.js'} | ${'foo.ts'}
		${'/config/foo.js'} | ${'g*f'}
		${'/config/foo.js'} | ${'/config/*.ts'}
		${'/config/foo.js'} | ${'/*.js'}
	`('should reject path "$path" with pattern "$pattern"', ({path, pattern}) => {
		expect(codeowners.match([path], pattern)).toEqual([])
	})

	/**
	 * @param {{
	 * files: string[],
	 * isDir: (path: string) => boolean,
	 * content: string,
	 * }} [options]
	 */
	const setup = ({files, isDir, content}) => {
		const ctx = codeowners.parse(content)

		ctx.files = files

		mockIsDir(isDir)

		return {ctx}
	}

	it('should reject patterns without file matches', () => {
		const {ctx} = setup({
			content: `
		@@@team1 @member1
		/foo @@team1
		/bar @@team1
		`,
			files: ['/bar'],
			isDir: path => {
				expect(path).toEqual('./bar')
				return false
			},
		})

		codeowners.check(ctx)

		expect(ctx.failures).toEqual([fail('No files matched for pattern')])
	})

	it('should reject dir without trailing slash', () => {
		// Note: "/foo" should have a trailing slash since it's a dir.
		const {ctx} = setup({
			content: `
		@@@team1 @member1
		/foo @@team1
		`,
			files: ['/foo/hi'],
			isDir: path => {
				expect(path).toEqual('./foo')
				return true
			},
		})

		codeowners.check(ctx)

		expect(ctx.failures).toEqual([fail('Found file instead of dir')])
	})

	it('should accept dir with trailing slash', () => {
		// Note: "/foo" should have a trailing slash since it's a dir.
		const {ctx} = setup({
			content: `
		@@@team1 @member1
		/foo/ @@team1
		`,
			files: ['/foo/hi'],
			isDir: path => {
				expect(path).toEqual('./foo/')
				return true
			},
		})

		codeowners.check(ctx)

		expect(ctx.failures).toEqual([])
	})

	it('should skip commented lines', () => {
		const {ctx} = setup({
			content: `
		# first
		@@@team1 @member1
		# second
		/foo/ @@team1
		# last
		`,
			files: ['/foo/hi'],
			isDir: () => true,
		})

		codeowners.check(ctx)

		expect(ctx.failures).toEqual([])
	})

	it('should remove trailing "**/*" from patterns', () => {
		const {ctx} = setup({
			content: `
		@@@team1 @member1
		/foo/**/* @@team1
		`,
			files: ['/foo/hi'],
			isDir: () => true,
		})

		codeowners.check(ctx)

		expect(ctx.failures).toEqual([])
	})

	it('should use the last matching rule', () => {
		const {ctx} = setup({
			content: `
		@@@team1 @member1
		@@@team2 @member2
		/foo/design/ @@team2
		/foo/ @@team1
		`,
			files: ['/foo/design/foo'],
			isDir: () => true,
		})

		const teams = ['@@team1']

		const results = codeowners.find(ctx)

		expect(results.teams()).toEqual(teams)
		expect(ctx.failures).toHaveLength(0)
	})

	it('should report an error for files in /packages/ without an owner', () => {
		const {ctx} = setup({
			content: `
		@@@team1 @member1
		@@@team2 @member2

		/matched/ @@team1 @@team2
		`,
			files: [
				// Note: unassigned files /other/ should not report an error for now.
				'/other/foo/hi.ts',
				'/packages/foo/hi.ts',
				'/matched/',
			],
			isDir: () => true,
		})

		codeowners.check(ctx)

		expect(ctx.failures).toEqual([
			expect.objectContaining({
				message: 'No owner found for path: /packages/foo/hi.ts',
			}),
		])
	})

	it('should report an error for unused teams', () => {
		const {ctx} = setup({
			content: `
		@@@team1 @member1
		@@@team2 @member2

		/matched/ @@team1
		`,
			files: ['/matched/'],
			isDir: () => false,
		})

		codeowners.check(ctx)

		expect(ctx.failures).toEqual([
			expect.objectContaining({
				line: undefined,
				message: 'Unused team "@@team2"',
			}),
		])
	})

	it('should report an error for path that is a subset of an earlier path', () => {
		const ctx = codeowners.parse(`
		@@@team1 @member1
		/foo/bar @@team1
		/foo/ @@team1
		`)

		ctx.files = ['/foo/bar', '/foo/1']
		ctx.inputFile = 'CODEOWNERS'

		mockIsDir(path => path.endsWith('/'))

		codeowners.check(ctx)

		expect(ctx.failures).toEqual([
			expect.objectContaining({
				description: 'Overlapping patterns',
				line: undefined,
				message: undefined,
				lines: [
					{
						file: 'CODEOWNERS',
						line: 2,
						msg: '/foo/bar @@team1',
					},
					{
						file: 'CODEOWNERS',
						line: 3,
						msg: '/foo/ @@team1',
					},
				],
			}),
		])
	})

	it.each`
		query        | teams
		${['foo']}   | ${['@@team1']}
		${['./foo']} | ${['@@team1']}
	`('should find owners for $query as $teams', ({query, teams}) => {
		// Note: "/foo" should have a trailing slash since it's a dir.
		const ctx = codeowners.parse(`
		@@@team1 @member1
		/foo/ @@team1
		`)

		ctx.files = query

		mockIsDir(path => {
			expect(path).toEqual('./foo')
			return true
		})

		const results = codeowners.find(ctx)

		expect(results.teams()).toEqual(teams)
		expect(ctx.failures).toHaveLength(0)
	})

	it.each`
		query                 | teams
		${['foo']}            | ${['@@team1']}
		${['foo/bar']}        | ${['@@team1']}
		${['foo/bar/baz']}    | ${['@@team1']}
		${['foo/bar/second']} | ${['@@team2']}
	`('should remove previous match results for $query as $teams', ({query, teams}) => {
		// Note: "/foo" should have a trailing slash since it's a dir.
		const ctx = codeowners.parse(`
		@@@team1 @member1
		@@@team2 @member2
		/foo/bar/baz @@team1
		/foo/bar/ @@team1
		/foo/ @@team1
		/foo/bar/second @@team2
		`)

		ctx.files = query

		mockIsDir(() => true)

		const results = codeowners.find(ctx)

		expect(results.teams()).toEqual(teams)
		expect(ctx.failures).toHaveLength(0)
	})

	it('should report an error for paths that do not exist', () => {
		// Note: "/foo" should have a trailing slash since it's a dir.
		const ctx = codeowners.parse(`
		@@@team1 @member1
		/foo/ @@team1
		`)

		ctx.files = ['unknown']

		mockIsDir(path => {
			expect(path).toEqual('./unknown')
			throw new Error(`ENOENT: no such file or directory, lstat '${path}'`)
		})

		const results = codeowners.find(ctx)
		expect(results.teams()).toEqual([])

		expect(ctx.failures).toEqual([
			expect.objectContaining({
				message: `cannot find: ./unknown on disk`,
			}),
			expect.objectContaining({
				message: `No owner found for path: /unknown/`,
			}),
		])
	})

	it('should successfully run queries with main()', () => {
		const inputFile = 'some/file'
		const command = 'query'

		const content = `
		@@@team1 @member1
		@@@team2 @member2
		/foo/design/ @@team2
		/foo/ @@team1
		`

		const query = 'foo'

		const read = jest.spyOn(fs, 'readFileSync').mockReturnValue(content)
		const log = jest.spyOn(console, 'log').mockImplementation()

		mockIsDir(() => true)

		codeowners.main([inputFile, command, query])

		expect(read).toBeCalledTimes(1)
		expect(read).toBeCalledWith(inputFile, 'utf8')

		expect(log).toBeCalledWith(expect.stringMatching(/@team1\s+\/foo\//))
	})
})
